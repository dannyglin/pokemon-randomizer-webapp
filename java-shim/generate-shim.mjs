#!/usr/bin/env node
// Reads settings-schema.json (extracted from the vendored randomizer's
// Settings.java — see docs/superpowers/specs) and emits two classes under
// src/com/pkrandomizerweb/: explicit, compile-time-typed calls into the
// real Settings class, one per field, in both directions:
//   - SettingsBuilder: JSON -> Settings -> binary .rnqs (used by job processing
//     and the "save current form as a file" export endpoint)
//   - SettingsReader: binary .rnqs -> Settings -> JSON (used by the "load an
//     existing settings file into the form" import endpoint)
// Regenerate whenever settings-schema.json changes (e.g. after bumping the
// vendored randomizer version): `node generate-shim.mjs`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(here, "settings-schema.json"), "utf8"));

const VARARGS_MARKER = /boolean\.\.\.\s*bools\)/;

function enumQualifiedName(enumType) {
  // ExpCurve lives in its own file (pokemon package); every other enum is
  // declared as a nested type inside Settings itself.
  return enumType === "ExpCurve" ? "com.dabomstew.pkrandom.pokemon.ExpCurve" : `Settings.${enumType}`;
}

function isVarargsOneHot(field) {
  return field.type === "enum" && typeof field.notes === "string" && VARARGS_MARKER.test(field.notes);
}

// Settings.java follows plain Java bean conventions: isX() for booleans,
// getX() for everything else — including enum-typed fields whose *setter*
// takes one-hot varargs booleans, which still expose a normal getX()
// returning the resolved enum. Verified against the real jar (see
// java-shim/test/com/pkrandomizerweb/RoundTripCheck.java).
function getterName(field) {
  const base = field.setter.slice(3); // strip "set"
  return field.type === "boolean" ? `is${base}` : `get${base}`;
}

function emitBuilderField(field) {
  const lines = [];
  switch (field.type) {
    case "boolean":
      lines.push(`settings.${field.setter}(json.optBoolean("${field.name}", false));`);
      break;

    case "int":
      lines.push(`settings.${field.setter}(json.optInt("${field.name}", 0));`);
      break;

    case "string":
      lines.push(`settings.${field.setter}(json.optString("${field.name}", ""));`);
      break;

    case "intArray":
      lines.push(`if (json.has("${field.name}")) {`);
      lines.push(`    org.json.JSONArray ${field.name}Arr = json.getJSONArray("${field.name}");`);
      lines.push(`    int[] ${field.name}Vals = new int[${field.name}Arr.length()];`);
      lines.push(`    for (int i = 0; i < ${field.name}Arr.length(); i++) ${field.name}Vals[i] = ${field.name}Arr.getInt(i);`);
      lines.push(`    settings.${field.setter}(${field.name}Vals);`);
      lines.push(`}`);
      break;

    case "enum": {
      const qualified = enumQualifiedName(field.enumType);
      const fallback = schema.enums[field.enumType]?.[0] ?? "";
      if (isVarargsOneHot(field)) {
        lines.push(`{`);
        lines.push(`    boolean[] ${field.name}Bools = new boolean[${qualified}.values().length];`);
        lines.push(`    ${field.name}Bools[${qualified}.valueOf(json.optString("${field.name}", "${fallback}")).ordinal()] = true;`);
        lines.push(`    settings.${field.setter}(${field.name}Bools);`);
        lines.push(`}`);
      } else {
        lines.push(`settings.${field.setter}(${qualified}.valueOf(json.optString("${field.name}", "${fallback}")));`);
      }
      break;
    }

    case "genRestrictions": {
      lines.push(`{`);
      lines.push(`    int genRestrictionsBits = 0;`);
      lines.push(`    org.json.JSONObject genRestrictionsObj = json.optJSONObject("${field.name}");`);
      lines.push(`    if (genRestrictionsObj != null) {`);
      for (const sub of schema.genRestrictions.fields) {
        lines.push(`        if (genRestrictionsObj.optBoolean("${sub.name}", false)) genRestrictionsBits |= (1 << ${sub.bitIndex});`);
      }
      lines.push(`    }`);
      lines.push(`    settings.${field.setter}(new GenRestrictions(genRestrictionsBits));`);
      lines.push(`}`);
      break;
    }

    case "miscTweaksBitmask": {
      lines.push(`{`);
      lines.push(`    int miscTweaksBits = 0;`);
      lines.push(`    org.json.JSONArray miscTweaksArr = json.optJSONArray("${field.name}");`);
      lines.push(`    if (miscTweaksArr != null) {`);
      lines.push(`        for (int i = 0; i < miscTweaksArr.length(); i++) {`);
      lines.push(`            switch (miscTweaksArr.getString(i)) {`);
      for (const tweak of schema.miscTweaks) {
        lines.push(`                case "${tweak.name}": miscTweaksBits |= ${tweak.bitValue}; break;`);
      }
      lines.push(`                default: break;`);
      lines.push(`            }`);
      lines.push(`        }`);
      lines.push(`    }`);
      lines.push(`    settings.${field.setter}(miscTweaksBits);`);
      lines.push(`}`);
      break;
    }

    default:
      lines.push(`// TODO: unhandled field type "${field.type}" for ${field.name}`);
  }
  return lines.map((l) => `        ${l}`).join("\n");
}

// Write-only convenience setters that fan out to other fields' real state
// instead of storing their own — no getter exists, so they're skipped when
// reading a settings file back out. (blockBrokenMoves sets
// blockBrokenMovesetMoves/blockBrokenTMMoves/blockBrokenTutorMoves, each of
// which already gets its own entry in the dump.)
const NO_GETTER_FIELDS = new Set(["blockBrokenMoves"]);

function emitReaderField(field) {
  if (NO_GETTER_FIELDS.has(field.name)) {
    return `        // ${field.name} intentionally skipped — write-only convenience setter, no getter (see NO_GETTER_FIELDS)`;
  }
  const getter = getterName(field);
  const lines = [];
  switch (field.type) {
    case "boolean":
    case "int":
    case "string":
      lines.push(`json.put("${field.name}", settings.${getter}());`);
      break;

    case "intArray":
      lines.push(`{`);
      lines.push(`    int[] ${field.name}Vals = settings.${getter}();`);
      lines.push(`    org.json.JSONArray ${field.name}Arr = new org.json.JSONArray();`);
      lines.push(`    for (int v : ${field.name}Vals) ${field.name}Arr.put(v);`);
      lines.push(`    json.put("${field.name}", ${field.name}Arr);`);
      lines.push(`}`);
      break;

    case "enum":
      lines.push(`json.put("${field.name}", settings.${getter}().name());`);
      break;

    case "genRestrictions": {
      lines.push(`{`);
      lines.push(`    GenRestrictions gr = settings.${getter}();`);
      lines.push(`    org.json.JSONObject grJson = new org.json.JSONObject();`);
      for (const sub of schema.genRestrictions.fields) {
        lines.push(`    grJson.put("${sub.name}", gr.${sub.name});`);
      }
      lines.push(`    json.put("${field.name}", grJson);`);
      lines.push(`}`);
      break;
    }

    case "miscTweaksBitmask": {
      lines.push(`{`);
      lines.push(`    int bits = settings.${getter}();`);
      lines.push(`    org.json.JSONArray tweaksArr = new org.json.JSONArray();`);
      for (const tweak of schema.miscTweaks) {
        lines.push(`    if ((bits & ${tweak.bitValue}) != 0) tweaksArr.put("${tweak.name}");`);
      }
      lines.push(`    json.put("${field.name}", tweaksArr);`);
      lines.push(`}`);
      break;
    }

    default:
      lines.push(`// TODO: unhandled field type "${field.type}" for ${field.name}`);
  }
  return lines.map((l) => `        ${l}`).join("\n");
}

function fieldComment(f) {
  return `        // ${f.name}${f.notes ? " -- " + f.notes.split("\n")[0].slice(0, 100) : ""}`;
}

const builderFieldBlocks = schema.fields.map((f) => `${fieldComment(f)}\n${emitBuilderField(f)}`).join("\n\n");
const readerFieldBlocks = schema.fields.map((f) => `${fieldComment(f)}\n${emitReaderField(f)}`).join("\n\n");

const builderSource = `package com.pkrandomizerweb;

import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.pokemon.GenRestrictions;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Generated by java-shim/generate-shim.mjs from settings-schema.json — do
 * not hand-edit. Reads a JSON settings payload (shaped by
 * settings-schema.json, produced by the web app's schema-driven form) and
 * calls the real {@link Settings} setters to build a Settings instance,
 * then writes it in the binary format {@code CliRandomizer} expects via
 * {@link Settings#write(FileOutputStream)}.
 *
 * Usage: java -cp PokeRandoZX.jar:settings-shim.jar com.pkrandomizerweb.SettingsBuilder <input.json> <output.rnqs>
 */
public class SettingsBuilder {

    public static void main(String[] args) {
        if (args.length != 2) {
            System.err.println("Usage: SettingsBuilder <input.json> <output.rnqs>");
            System.exit(1);
        }
        String inputJsonPath = args[0];
        String outputSettingsPath = args[1];

        try {
            String raw = new String(Files.readAllBytes(new File(inputJsonPath).toPath()), StandardCharsets.UTF_8);
            JSONObject json = new JSONObject(raw);

            Settings settings = new Settings();
            apply(settings, json);

            try (FileOutputStream out = new FileOutputStream(outputSettingsPath)) {
                settings.write(out);
            }
            System.out.println("Settings file written successfully.");
        } catch (IOException e) {
            System.err.println("ERROR: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        } catch (RuntimeException e) {
            System.err.println("ERROR: invalid settings payload: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void apply(Settings settings, JSONObject json) {
${builderFieldBlocks}
    }
}
`;

const readerSource = `package com.pkrandomizerweb;

import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.pokemon.GenRestrictions;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * Generated by java-shim/generate-shim.mjs from settings-schema.json — do
 * not hand-edit. The inverse of {@link SettingsBuilder}: reads an existing
 * binary .rnqs settings file via the real {@link Settings#read(FileInputStream)}
 * (the same format produced by the desktop app's "Make Preset" / by our own
 * SettingsBuilder) and prints it as JSON shaped by settings-schema.json, so
 * the web form can be prefilled from an uploaded settings file.
 *
 * Usage: java -cp PokeRandoZX.jar:settings-shim.jar com.pkrandomizerweb.SettingsReader <input.rnqs>
 * Prints the JSON payload to stdout.
 */
public class SettingsReader {

    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("Usage: SettingsReader <input.rnqs>");
            System.exit(1);
        }
        String inputSettingsPath = args[0];

        try (FileInputStream in = new FileInputStream(new File(inputSettingsPath))) {
            Settings settings = Settings.read(in);
            JSONObject json = new JSONObject();
            dump(settings, json);
            System.out.println(json.toString());
        } catch (IOException e) {
            System.err.println("ERROR: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        } catch (RuntimeException e) {
            System.err.println("ERROR: invalid or unreadable settings file: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void dump(Settings settings, JSONObject json) {
${readerFieldBlocks}
    }
}
`;

const outDir = path.join(here, "src", "com", "pkrandomizerweb");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "SettingsBuilder.java"), builderSource, "utf8");
fs.writeFileSync(path.join(outDir, "SettingsReader.java"), readerSource, "utf8");
console.log(`Wrote SettingsBuilder.java and SettingsReader.java (${schema.fields.length} fields each)`);

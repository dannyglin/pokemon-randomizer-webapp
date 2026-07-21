import type { SettingsSchema, SettingsSchemaField } from "@pokemon-randomizer/shared";

export type SettingsValues = Record<string, unknown>;

interface Props {
  schema: SettingsSchema;
  values: SettingsValues;
  onChange: (next: SettingsValues) => void;
}

function groupFields(fields: SettingsSchemaField[]): Map<string, SettingsSchemaField[]> {
  const groups = new Map<string, SettingsSchemaField[]>();
  for (const field of fields) {
    const list = groups.get(field.group) ?? [];
    list.push(field);
    groups.set(field.group, list);
  }
  return groups;
}

/**
 * Renders all ~144 Settings fields generically from settings-schema.json
 * rather than one hand-written control per field — see design spec §4.
 */
export function SettingsForm({ schema, values, onChange }: Props) {
  const groups = groupFields(schema.fields);

  const setField = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  return (
    <div className="settings-form">
      {[...groups.entries()].map(([groupName, fields]) => (
        <details key={groupName} className="settings-group" open={false}>
          <summary>{groupName}</summary>
          <div className="settings-group-body">
            {fields.map((field) => (
              <FieldControl
                key={field.name}
                schema={schema}
                field={field}
                value={values[field.name]}
                onChange={(v) => setField(field.name, v)}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function FieldControl({
  schema,
  field,
  value,
  onChange,
}: {
  schema: SettingsSchema;
  field: SettingsSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "string":
      return (
        <label className="field field-string">
          {field.name}
          <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </label>
      );

    case "intArray": {
      const arr = Array.isArray(value) ? (value as number[]) : [0, 0, 0];
      return (
        <fieldset className="field field-int-array">
          <legend>{field.name}</legend>
          {arr.map((v, i) => (
            <input
              key={i}
              type="number"
              value={v}
              onChange={(e) => {
                const next = [...arr];
                next[i] = Number(e.target.value);
                onChange(next);
              }}
            />
          ))}
        </fieldset>
      );
    }

    case "boolean":
      return (
        <label className="field field-boolean">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.name}
        </label>
      );

    case "int":
      return (
        <label className="field field-int">
          {field.name}
          <input
            type="number"
            value={typeof value === "number" ? value : 0}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </label>
      );

    case "enum": {
      const options = field.enumType ? (schema.enums[field.enumType] ?? []) : [];
      return (
        <label className="field field-enum">
          {field.name}
          <select value={typeof value === "string" ? value : options[0] ?? ""} onChange={(e) => onChange(e.target.value)}>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    case "genRestrictions": {
      const current = (value as Record<string, unknown>) ?? {};
      return (
        <fieldset className="field field-gen-restrictions">
          <legend>{field.name}</legend>
          {schema.genRestrictions.fields.map((sub) => (
            <label key={sub.name} className="field field-boolean">
              {sub.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(current[sub.name])}
                  onChange={(e) => onChange({ ...current, [sub.name]: e.target.checked })}
                />
              ) : (
                <input
                  type="number"
                  value={typeof current[sub.name] === "number" ? (current[sub.name] as number) : 0}
                  onChange={(e) => onChange({ ...current, [sub.name]: Number(e.target.value) })}
                />
              )}
              {sub.name}
            </label>
          ))}
        </fieldset>
      );
    }

    case "miscTweaksBitmask": {
      const selected = new Set((value as string[] | undefined) ?? []);
      return (
        <fieldset className="field field-misc-tweaks">
          <legend>{field.name}</legend>
          {schema.miscTweaks.map((tweak) => (
            <label key={tweak.name} className="field field-boolean">
              <input
                type="checkbox"
                checked={selected.has(tweak.name)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(tweak.name);
                  else next.delete(tweak.name);
                  onChange([...next]);
                }}
              />
              {tweak.name}
            </label>
          ))}
        </fieldset>
      );
    }

    default:
      return null;
  }
}

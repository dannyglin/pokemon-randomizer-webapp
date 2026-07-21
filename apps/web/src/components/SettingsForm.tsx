import type { SettingsSchema, SettingsSchemaField } from "@pokemon-randomizer/shared";

export type SettingsValues = Record<string, unknown>;

interface Props {
  schema: SettingsSchema;
  values: SettingsValues;
  onChange: (next: SettingsValues) => void;
  filter: string;
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

function matchesFilter(field: SettingsSchemaField, query: string): boolean {
  if (!query) return true;
  const haystack = `${field.name} ${field.group}`.toLowerCase();
  return haystack.includes(query);
}

/**
 * Renders all ~150 Settings fields generically from settings-schema.json
 * rather than one hand-written control per field — see design spec §4.
 */
export function SettingsForm({ schema, values, onChange, filter }: Props) {
  const groups = groupFields(schema.fields);
  const query = filter.trim().toLowerCase();

  const setField = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  const visibleGroups = [...groups.entries()]
    .map(([groupName, fields]) => [groupName, fields.filter((f) => matchesFilter(f, query))] as const)
    .filter(([, fields]) => fields.length > 0);

  return (
    <div className="settings-form">
      {visibleGroups.map(([groupName, fields]) => (
        <details key={groupName} className="settings-group" open={query.length > 0}>
          <summary>
            <span>{groupName}</span>
            <span className="settings-group-count">{fields.length}</span>
          </summary>
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
      {visibleGroups.length === 0 ? <p className="field-note">No settings match "{filter}".</p> : null}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      {label}
    </label>
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
        <label className="field">
          <span>{field.name}</span>
          <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </label>
      );

    case "intArray": {
      const arr = Array.isArray(value) ? (value as number[]) : [0, 0, 0];
      return (
        <fieldset className="field-int-array">
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
      return <Toggle label={field.name} checked={Boolean(value)} onChange={onChange} />;

    case "int":
      return (
        <label className="field">
          <span>{field.name}</span>
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
        <label className="field">
          <span>{field.name}</span>
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
        <fieldset className="field-gen-restrictions">
          <legend>{field.name}</legend>
          {schema.genRestrictions.fields.map((sub) => (
            <div key={sub.name}>
              {sub.type === "boolean" ? (
                <Toggle
                  label={sub.name}
                  checked={Boolean(current[sub.name])}
                  onChange={(checked) => onChange({ ...current, [sub.name]: checked })}
                />
              ) : (
                <label className="field">
                  <span>{sub.name}</span>
                  <input
                    type="number"
                    value={typeof current[sub.name] === "number" ? (current[sub.name] as number) : 0}
                    onChange={(e) => onChange({ ...current, [sub.name]: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          ))}
        </fieldset>
      );
    }

    case "miscTweaksBitmask": {
      const selected = new Set((value as string[] | undefined) ?? []);
      return (
        <fieldset className="field-misc-tweaks">
          <legend>{field.name}</legend>
          {schema.miscTweaks.map((tweak) => (
            <div key={tweak.name}>
              <Toggle
                label={tweak.name}
                checked={selected.has(tweak.name)}
                onChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(tweak.name);
                  else next.delete(tweak.name);
                  onChange([...next]);
                }}
              />
            </div>
          ))}
        </fieldset>
      );
    }

    default:
      return null;
  }
}

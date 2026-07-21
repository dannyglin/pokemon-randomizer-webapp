export type SettingsFieldType = "boolean" | "int" | "string" | "intArray" | "enum" | "genRestrictions" | "miscTweaksBitmask";

export interface SettingsSchemaField {
  name: string;
  setter: string;
  type: SettingsFieldType;
  enumType?: string;
  group: string;
  notes?: string;
}

export interface MiscTweakDefinition {
  name: string;
  bitValue: number;
  bundleKey?: string;
}

export interface GenRestrictionsFieldDefinition {
  name: string;
  type: "boolean" | "int";
  bitIndex?: number;
}

export interface SettingsSchema {
  sourceTag: string;
  enums: Record<string, string[]>;
  fields: SettingsSchemaField[];
  miscTweaks: MiscTweakDefinition[];
  genRestrictions: { fields: GenRestrictionsFieldDefinition[] };
}

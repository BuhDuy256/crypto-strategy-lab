// Compact framework-free parameter schema shared by validation and generic UI forms.

export type StrategyParameterValue = string | number | boolean;
export type StrategyParameters = Readonly<Record<string, StrategyParameterValue>>;

interface ParameterBase {
  readonly label: string;
  readonly description?: string;
}

export interface NumberParameter extends ParameterBase {
  readonly type: "number" | "integer";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: number;
}

export interface BooleanParameter extends ParameterBase {
  readonly type: "boolean";
  readonly default?: boolean;
}

export interface EnumParameter extends ParameterBase {
  readonly type: "enum";
  readonly values: readonly string[];
  readonly default?: string;
}

export type ParameterDefinition = NumberParameter | BooleanParameter | EnumParameter;

export interface ParameterSchema {
  readonly properties: Readonly<Record<string, ParameterDefinition>>;
  readonly required: readonly string[];
}

export function validateParameters(schema: ParameterSchema, parameters: StrategyParameters): void {
  for (const required of schema.required) {
    if (!(required in parameters)) {
      throw new Error(`STRATEGY_PARAMETER_REQUIRED: missing field ${required}`);
    }
  }
  for (const [field, value] of Object.entries(parameters)) {
    const definition = schema.properties[field];
    if (definition === undefined) {
      throw new Error(`STRATEGY_PARAMETER_UNKNOWN: unknown field ${field}`);
    }
    if (definition.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be boolean`);
      }
      continue;
    }
    if (definition.type === "enum") {
      if (typeof value !== "string" || !definition.values.includes(value)) {
        throw new Error(`STRATEGY_PARAMETER_ENUM: field ${field} must be one of ${definition.values.join(", ")}`);
      }
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be a finite number`);
    }
    if (definition.type === "integer" && !Number.isInteger(value)) {
      throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be an integer`);
    }
    if (definition.minimum !== undefined && value < definition.minimum) {
      throw new Error(`STRATEGY_PARAMETER_MINIMUM: field ${field} must be at least ${definition.minimum}`);
    }
    if (definition.maximum !== undefined && value > definition.maximum) {
      throw new Error(`STRATEGY_PARAMETER_MAXIMUM: field ${field} must be at most ${definition.maximum}`);
    }
  }
}

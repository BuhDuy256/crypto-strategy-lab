import type {
  ApiParameterProperty,
  ApiParameterSchema,
  ApiStrategyParameters,
  ApiStrategyParameterValue
} from "@crypto-strategy-lab/api-contracts";
import { useEffect } from "react";

interface GenericParameterFormProps {
  schema: ApiParameterSchema;
  values: ApiStrategyParameters;
  onChange: (values: ApiStrategyParameters) => void;
}

function isParameterValue(value: unknown): value is ApiStrategyParameterValue {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function GenericParameterForm({ schema, values, onChange }: GenericParameterFormProps) {
  useEffect(() => {
    const newValues = { ...values };
    let changed = false;
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (newValues[key] === undefined && isParameterValue(prop.default)) {
        newValues[key] = prop.default;
        changed = true;
      }
    }
    if (changed) {
      onChange(newValues);
    }
  }, [schema, values, onChange]);

  const handleChange = (key: string, value: string, type: ApiParameterProperty["type"]) => {
    let parsedValue: ApiStrategyParameterValue = value;
    if (type === "number" || type === "integer") {
      parsedValue = value === "" ? "" : Number(value);
    } else if (type === "boolean") {
      parsedValue = value === "true";
    }
    onChange({ ...values, [key]: parsedValue });
  };

  return (
    <div className="parameter-form">
      {Object.entries(schema.properties).map(([key, prop]) => (
        <div key={key} className="parameter-field">
          <div className="parameter-heading">
            <label className="parameter-label">
              <span>{prop.label || key}</span>
              {(schema.required as string[]).includes(key) && (
                <span className="required-marker" aria-label="required">*</span>
              )}
            </label>
            {prop.description && (
              <span className="parameter-description" title={prop.description}>{prop.description}</span>
            )}
          </div>

          {prop.type === "enum" && prop.values ? (
            <select
              className="bg-[#181b25] border border-gray-700/80 hover:border-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded px-3 py-2 text-sm text-gray-200 outline-none transition-all"
              value={String(values[key] ?? "")}
              onChange={(e) => handleChange(key, e.target.value, prop.type)}
            >
              <option value="" disabled>Select...</option>
              {prop.values.map((val: string) => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
          ) : prop.type === "boolean" ? (
             <select
              className="bg-[#181b25] border border-gray-700/80 hover:border-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded px-3 py-2 text-sm text-gray-200 outline-none transition-all"
              value={String(values[key] ?? "")}
              onChange={(e) => handleChange(key, e.target.value, prop.type)}
            >
              <option value="" disabled>Select...</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              type={prop.type === "number" || prop.type === "integer" ? "number" : "text"}
              className="bg-[#181b25] border border-gray-700/80 hover:border-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded px-3 py-2 text-sm text-gray-200 font-mono outline-none transition-all shadow-inner"
              value={String(values[key] ?? "")}
              onChange={(e) => handleChange(key, e.target.value, prop.type)}
              min={prop.minimum}
              max={prop.maximum}
            />
          )}
        </div>
      ))}
    </div>
  );
}

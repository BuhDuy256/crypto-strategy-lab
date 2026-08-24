import type { ApiParameterSchema } from "@crypto-strategy-lab/api-contracts";
import { useState, useEffect } from "react";

interface GenericParameterFormProps {
  schema: ApiParameterSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
}

export function GenericParameterForm({ schema, values, onChange }: GenericParameterFormProps) {
  useEffect(() => {
    const newValues = { ...values };
    let changed = false;
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (newValues[key] === undefined && prop.default !== undefined) {
        newValues[key] = prop.default;
        changed = true;
      }
    }
    if (changed) {
      onChange(newValues);
    }
  }, [schema, values, onChange]);

  const handleChange = (key: string, value: any, type: string) => {
    let parsedValue = value;
    if (type === "number" || type === "integer") {
      parsedValue = value === "" ? "" : Number(value);
    } else if (type === "boolean") {
      parsedValue = value === "true";
    }
    onChange({ ...values, [key]: parsedValue });
  };

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(schema.properties).map(([key, prop]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <div className="flex justify-between items-end">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {prop.label || key} {(schema.required as string[]).includes(key) && <span className="text-red-500">*</span>}
            </label>
            {prop.description && (
              <span className="text-[10px] text-gray-500 italic max-w-[60%] text-right truncate" title={prop.description}>{prop.description}</span>
            )}
          </div>
          
          {prop.type === "enum" && prop.values ? (
            <select
              className="bg-[#181b25] border border-gray-700/80 hover:border-gray-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded px-3 py-2 text-sm text-gray-200 outline-none transition-all"
              value={values[key] ?? ""}
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
              value={values[key] ?? ""}
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

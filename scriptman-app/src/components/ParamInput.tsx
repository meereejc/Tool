import type { ParamDef, ParamValue } from "../types/script";

interface ParamInputProps {
  param: ParamDef;
  value: ParamValue | undefined;
  onChange: (value: ParamValue) => void;
}

function detectIntent(param: ParamDef): "input" | "output" | null {
  const source = `${param.name} ${param.description}`.toLowerCase();

  if (source.includes("input")) {
    return "input";
  }

  if (source.includes("output")) {
    return "output";
  }

  return null;
}

export default function ParamInput({
  param,
  value,
  onChange,
}: ParamInputProps) {
  const lowerType = param.valueType.toLowerCase();
  const intent = detectIntent(param);
  const id = `param-${param.name}`;

  return (
    <label
      className={`param-field${intent ? ` param-field-${intent}` : ""}`}
      htmlFor={id}
    >
      <div className="param-label-row">
        <span className="param-label">{param.name}</span>
        {intent ? (
          <span className="param-intent">
            {intent === "input" ? "Input" : "Output"}
          </span>
        ) : null}
        {param.required ? <span className="param-required">Required</span> : null}
      </div>
      <span className="param-description">{param.description}</span>
      {lowerType === "bool" || lowerType === "boolean" ? (
        <input
          id={id}
          type="checkbox"
          aria-label={param.name}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      ) : (
        <input
          id={id}
          aria-label={param.name}
          className="param-input"
          type={lowerType === "int" || lowerType === "number" ? "number" : "text"}
          value={value == null ? "" : String(value)}
          onChange={(event) =>
            onChange(
              lowerType === "int" || lowerType === "number"
                ? Number(event.currentTarget.value)
                : event.currentTarget.value,
            )
          }
        />
      )}
    </label>
  );
}

"use client";

import { useState } from "react";

type Division = { value: string; label: string };

export function DivisionRosterFields({
  divisions,
  unitId,
  initialUnit = "",
  initialGroup = "",
  unitRequired = false,
  allowNoUnit = true,
  unitHint,
  groupHint,
}: {
  divisions: Division[];
  unitId: string;
  initialUnit?: string;
  initialGroup?: string;
  unitRequired?: boolean;
  allowNoUnit?: boolean;
  unitHint: string;
  groupHint: string;
}) {
  const [unit, setUnit] = useState(initialUnit);

  return (
    <>
      <div className="field">
        <label htmlFor={unitId}>Unit / Bureau <span className="hint">{unitHint}</span></label>
        <select id={unitId} name="unit" value={unit} onChange={(event) => setUnit(event.target.value)} required={unitRequired}>
          {allowNoUnit && <option value="" disabled={unitRequired}>No unit set</option>}
          {divisions.map((division) => <option key={division.value} value={division.value}>{division.label}</option>)}
        </select>
      </div>
      {unit === "Criminal Division" && <div className="field">
        <label htmlFor={`${unitId}-group`}>Criminal Division group <span className="hint">{groupHint}</span></label>
        <select id={`${unitId}-group`} name="divisionGroup" defaultValue={initialGroup}>
          <option value="">No group assigned</option>
          <option value="1">Group 1</option>
          <option value="2">Group 2</option>
        </select>
      </div>}
    </>
  );
}

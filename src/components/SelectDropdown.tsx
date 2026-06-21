"use client";

import { useRef, useState, useEffect } from "react";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  colour?: string;
  icon?: React.ReactNode;
};

type CommonProps = {
  options: SelectOption[];
  placeholder?: string;
  nullable?: boolean;
  nullLabel?: string;
};

type SingleProps = CommonProps & {
  multiSelect?: false;
  value: string;
  onChange: (value: string) => void;
};

type MultiProps = CommonProps & {
  multiSelect: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type Props = SingleProps | MultiProps;

export default function SelectDropdown(props: Props) {
  const { options, placeholder = "Select…", nullable = true, nullLabel = "None" } = props;

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function isSelected(optValue: string): boolean {
    if (props.multiSelect) return props.value.includes(optValue);
    return props.value === optValue;
  }

  function handleSelect(optValue: string) {
    if (props.multiSelect) {
      const next = props.value.includes(optValue)
        ? props.value.filter((v) => v !== optValue)
        : [...props.value, optValue];
      props.onChange(next);
    } else {
      props.onChange(optValue);
      setOpen(false);
    }
  }

  function handleClear() {
    if (props.multiSelect) props.onChange([]);
    else props.onChange("");
    setOpen(false);
  }

  const isEmpty = props.multiSelect ? props.value.length === 0 : !props.value;

  function renderTriggerLabel() {
    if (props.multiSelect) {
      if (props.value.length === 0) return <span className="text-[#1c1c1e]/35">{placeholder}</span>;
      const labels = props.value.map((v) => options.find((o) => o.value === v)?.label ?? v);
      const text = props.value.length <= 2 ? labels.join(", ") : `${props.value.length} selected`;
      return (
        <span className="font-medium text-[#1c1c1e] truncate">{text}</span>
      );
    }
    const selected = options.find((o) => o.value === props.value) ?? null;
    if (!selected) return <span className="text-[#1c1c1e]/35">{placeholder}</span>;
    return (
      <>
        {selected.colour ? (
          <span
            className="shrink-0 w-5 h-5 rounded-md border border-black/10"
            style={{ backgroundColor: selected.colour }}
          />
        ) : selected.icon ? (
          <span className="shrink-0 w-5 h-5 flex items-center justify-center text-[#1c1c1e]/50">{selected.icon}</span>
        ) : null}
        <span className="font-medium text-[#1c1c1e] truncate">{selected.label}</span>
        {selected.description && (
          <span className="text-xs text-[#1c1c1e]/40 truncate hidden sm:block">{selected.description}</span>
        )}
      </>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#1c1c1e]/15 bg-white text-sm text-left hover:border-[#ee8000]/50 focus:outline-none focus:ring-2 focus:ring-[#ee8000]/50 transition"
      >
        {renderTriggerLabel()}
        <svg
          className="ml-auto shrink-0 text-[#1c1c1e]/30 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-[#1c1c1e]/10 shadow-xl overflow-hidden">
          {nullable && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors border-b border-[#1c1c1e]/5 ${
                isEmpty ? "bg-[#ee8000]/10 text-[#ee8000] font-medium" : "hover:bg-[#1c1c1e]/5 text-[#1c1c1e]/50"
              }`}
            >
              <span className="w-5 h-5 rounded-md border border-dashed border-[#1c1c1e]/20 shrink-0" />
              {nullLabel}
            </button>
          )}

          <div className="max-h-56 overflow-y-auto">
            {options.map((opt) => {
              const sel = isSelected(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors border-b border-[#1c1c1e]/5 last:border-0 ${
                    sel ? "bg-[#ee8000]/10" : "hover:bg-[#1c1c1e]/5"
                  }`}
                >
                  {props.multiSelect ? (
                    <span className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                      sel ? "bg-[#ee8000] border-[#ee8000]" : "border-[#1c1c1e]/20"
                    }`}>
                      {sel && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  ) : opt.colour ? (
                    <span
                      className="shrink-0 w-5 h-5 rounded-md border border-black/10"
                      style={{ backgroundColor: opt.colour }}
                    />
                  ) : opt.icon ? (
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center text-[#1c1c1e]/40">{opt.icon}</span>
                  ) : (
                    <span className="shrink-0 w-5 h-5" />
                  )}
                  <span className="font-medium text-[#1c1c1e]">{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-[#1c1c1e]/40 truncate">{opt.description}</span>
                  )}
                  {!props.multiSelect && sel && (
                    <svg className="ml-auto shrink-0 text-[#ee8000]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Multi-select footer */}
          {props.multiSelect && props.value.length > 0 && (
            <div className="border-t border-[#1c1c1e]/5 px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs text-[#1c1c1e]/40">{props.value.length} selected</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-[#ee8000] hover:text-[#d97000] transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

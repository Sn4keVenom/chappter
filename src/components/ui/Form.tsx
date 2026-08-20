// src/components/ui/Form.tsx
//
// Form controls. Every one renders a real labelled form element — `<label
// for>` wired to a generated id, hints and errors linked with
// aria-describedby, and `aria-invalid` on failure — so the browser's own
// autofill, validation, and assistive-technology support all work.

import { useId } from "react";
import styles from "./Form.module.css";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Hide the label visually but keep it for screen readers. */
  hiddenLabel?: boolean;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    className: string;
  }) => React.ReactNode;
}

function FieldShell({ label, hint, error, required, hiddenLabel, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Error first: when both are present a screen reader should read the
  // failure before the general guidance.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={hiddenLabel ? "sr-only" : styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        className: [styles.control, error ? styles.invalid : ""].filter(Boolean).join(" "),
      })}
      {error ? (
        <p className={styles.error} id={errorId}>
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "className"> & {
  label: string;
  hint?: string;
  error?: string;
  hiddenLabel?: boolean;
};

export function Input({ label, hint, error, hiddenLabel, required, ...rest }: InputProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} hiddenLabel={hiddenLabel}>
      {(a11y) => <input {...a11y} required={required} {...rest} />}
    </FieldShell>
  );
}

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className"> & {
  label: string;
  hint?: string;
  error?: string;
  hiddenLabel?: boolean;
};

export function Textarea({ label, hint, error, hiddenLabel, required, ...rest }: TextareaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} hiddenLabel={hiddenLabel}>
      {(a11y) => <textarea {...a11y} required={required} {...rest} />}
    </FieldShell>
  );
}

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id" | "className"> & {
  label: string;
  hint?: string;
  error?: string;
  hiddenLabel?: boolean;
};

export function Select({ label, hint, error, hiddenLabel, required, children, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required} hiddenLabel={hiddenLabel}>
      {(a11y) => (
        <select {...a11y} required={required} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

/**
 * Toggle. A native checkbox would be simplest, but the design calls for a
 * sliding switch — so this is a button with role="switch", which conveys the
 * same semantics and state to assistive technology.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={styles.switchRow}>
      <span className={styles.switchBody}>
        <span className={styles.switchLabel} id={id}>
          {label}
        </span>
        {hint ? (
          <span className={styles.switchHint} id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        aria-describedby={hintId}
        disabled={disabled}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.switchKnob} />
      </button>
    </div>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Single-select list styled as rows. Uses radiogroup/radio roles rather than
 * native inputs so the row itself is the target — a 56px hit area instead of a
 * 20px circle.
 */
export function ChoiceList<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Choice<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className={styles.choiceList} role="radiogroup" aria-label={legend}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={[styles.choice, selected ? styles.choiceSelected : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(option.value)}
          >
            <span className={styles.choiceBody}>
              <span className={styles.choiceLabel}>{option.label}</span>
              {option.hint ? <span className={styles.choiceHint}>{option.hint}</span> : null}
            </span>
            <span className={styles.radio} aria-hidden="true">
              {selected ? <span className={styles.radioDot} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal filter chips. Multi-select is the caller's concern. */
export function ChipGroup<T extends string>({
  label,
  options,
  isSelected,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <div className={styles.chipRow} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = isSelected(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={[styles.chip, selected ? styles.chipSelected : ""].filter(Boolean).join(" ")}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Two-to-four mutually exclusive views — Individual/Team, Upcoming/Past. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  block,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  block?: boolean;
}) {
  return (
    <div
      className={[styles.segmented, block ? styles.segmentedBlock : ""].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.segment, active ? styles.segmentActive : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

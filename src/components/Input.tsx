import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

const INPUT_BASE =
  "min-w-0 rounded-default border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input ref={ref} className={[INPUT_BASE, className ?? ""].join(" ")} {...rest} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={[INPUT_BASE, "resize-y leading-relaxed", className ?? ""].join(" ")}
      {...rest}
    />
  );
});

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-text-primary">{label}</span>
      {children}
      {error ? (
        <span className="block text-2xs text-danger">{error}</span>
      ) : hint ? (
        <span className="block text-2xs text-text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

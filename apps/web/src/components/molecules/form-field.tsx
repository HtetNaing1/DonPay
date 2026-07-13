import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Labeled input with inline error — presentational; validation lives in the form. */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, className, ...inputProps },
  ref,
) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          'mt-1.5 block h-11 w-full rounded-md border bg-surface px-3.5 text-[15px] text-ink',
          'placeholder:text-ink-soft/50',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          error ? 'border-destructive' : 'border-hairline hover:border-ink-soft/50',
        )}
        {...inputProps}
      />
      {error ? (
        <p id={messageId} role="alert" className="mt-1.5 text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-[13px] text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

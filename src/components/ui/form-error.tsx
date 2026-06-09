import { cn } from "@/lib/utils";

type FormErrorProps = {
  children: string;
  className?: string;
};

export function FormError({ children, className }: FormErrorProps) {
  return (
    <p className={cn("rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive", className)}>
      {children}
    </p>
  );
}

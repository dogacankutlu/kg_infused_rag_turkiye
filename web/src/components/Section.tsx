import type { ReactNode } from "react";

export default function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

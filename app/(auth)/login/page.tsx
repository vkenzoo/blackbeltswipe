"use client";

import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/logo";

export default function LoginPage() {
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push("/app");
  }

  return (
    <div
      className="min-h-screen grid place-items-center px-4 relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.10) 0%, transparent 40%),
          radial-gradient(ellipse at 70% 80%, rgba(255,255,255,0.05) 0%, transparent 45%),
          #000000
        `,
      }}
    >
      <div className="absolute inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>\")",
            opacity: 0.02,
            mixBlendMode: "overlay",
          }}
        />
      </div>

      <div className="glass-strong rounded-[var(--r-xl)] p-10 w-full max-w-[420px] relative z-10 flex flex-col gap-6">
        <Logo size="md" />

        <div className="mt-2">
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em] mb-1.5">
            Bem-vindo de volta.
          </h1>
          <p className="text-[13px] text-text-2">
            Entre pra acessar a biblioteca curada.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            name="email"
            placeholder="seu@email.com"
            defaultValue="kenzo@roi.ventures"
            className="
              w-full px-4 py-3.5 rounded-[var(--r-md)]
              bg-black/30 border border-[var(--border-default)]
              text-[14px] text-text placeholder:text-text-3
              transition-[border-color,background,box-shadow] duration-200
              focus:outline-none focus:border-[var(--accent)]
              focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
            "
            required
          />
          <input
            type="password"
            name="password"
            placeholder="••••••••"
            defaultValue="password"
            className="
              w-full px-4 py-3.5 rounded-[var(--r-md)]
              bg-black/30 border border-[var(--border-default)]
              text-[14px] text-text placeholder:text-text-3
              transition-[border-color,background,box-shadow] duration-200
              focus:outline-none focus:border-[var(--accent)]
              focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
            "
            required
          />
          <button
            type="submit"
            className="
              w-full py-3.5 mt-1 rounded-[var(--r-md)]
              bg-[var(--accent)] text-black font-semibold text-[14px]
              transition-[transform,background] duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.01] hover:bg-white
              active:scale-[0.98]
              tracking-[-0.01em]
            "
          >
            Entrar
          </button>
        </form>

        <div className="text-center text-[12px] text-text-3">
          Esqueceu a senha?{" "}
          <a href="#" className="font-medium text-text hover:underline">
            Recuperar acesso
          </a>
        </div>
      </div>
    </div>
  );
}

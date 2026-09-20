"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error || "Admin login failed.");
        return;
      }

      setSecret("");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Organizer access
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
        Admin dashboard
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
        Enter the organizer secret to view workshop progress and exports.
      </p>
      <label
        htmlFor="admin-secret"
        className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200"
      >
        Admin secret
      </label>
      <input
        id="admin-secret"
        type="password"
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 dark:focus:ring-teal-800"
      />
      {error ? (
        <p className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950 p-3 text-sm leading-6 text-amber-900 dark:text-amber-300">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!secret || isSubmitting}
        className="mt-4 h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        {isSubmitting ? "Checking..." : "Enter admin"}
      </button>
      <Link
        href="/"
        className="mt-3 flex h-10 w-full items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300"
      >
        Back to home
      </Link>
    </form>
  );
}

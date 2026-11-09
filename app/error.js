'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('Odyssey page error:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080D18] px-4 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#111827] p-6 text-center">
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Your data is safe. Try loading this page again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 min-h-11 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
        >
          Try again
        </button>
      </section>
    </main>
  );
}

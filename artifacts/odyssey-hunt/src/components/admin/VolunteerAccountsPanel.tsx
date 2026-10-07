import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LoaderCircle, Plus, Shield, Trash2, UserRoundPlus } from "lucide-react";
import {
  getGetVolunteerAccountsQueryKey,
  useCreateVolunteer,
  useDeleteVolunteerAccount,
  useGetVolunteerAccounts,
  useResetVolunteerPassword,
} from "@workspace/api-client-react";

function errorMessage(error: unknown): string {
  const value = error as { data?: { error?: unknown }; message?: unknown };
  if (typeof value?.data?.error === "string") return value.data.error;
  if (typeof value?.message === "string") return value.message;
  return "That change could not be saved. Please try again.";
}

export function VolunteerAccountsPanel() {
  const queryClient = useQueryClient();
  const accounts = useGetVolunteerAccounts({
    query: {
      queryKey: getGetVolunteerAccountsQueryKey(),
      refetchInterval: 15_000,
      refetchOnMount: "always",
    },
  });
  const createAccount = useCreateVolunteer();
  const resetPassword = useResetVolunteerPassword();
  const deleteAccount = useDeleteVolunteerAccount();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [replacementPassword, setReplacementPassword] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const refreshAccounts = () =>
    queryClient.invalidateQueries({ queryKey: getGetVolunteerAccountsQueryKey() });

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    try {
      await createAccount.mutateAsync({
        data: { username: username.trim(), password },
      });
      setUsername("");
      setPassword("");
      await refreshAccounts();
      setFeedback({
        kind: "success",
        text: "Volunteer account created. Share the username and password privately; the password cannot be viewed again.",
      });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error) });
    }
  };

  const reset = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    setFeedback(null);
    try {
      await resetPassword.mutateAsync({ id, data: { password: replacementPassword } });
      setReplacementPassword("");
      setResetId(null);
      await refreshAccounts();
      setFeedback({
        kind: "success",
        text: "Password changed. The volunteer’s existing sessions have been signed out.",
      });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error) });
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete the volunteer account “${name}”? This also signs out any active sessions.`)) {
      return;
    }
    setFeedback(null);
    try {
      await deleteAccount.mutateAsync({ id });
      await refreshAccounts();
      setFeedback({ kind: "success", text: `Volunteer account “${name}” deleted.` });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`border px-4 py-3 text-sm ${
            feedback.kind === "error"
              ? "border-[#a63f36] bg-[#fff0eb] text-[#702a23]"
              : "border-[#4d7651] bg-[#edf6e9] text-[#23452c]"
          }`}
          role={feedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.text}
        </div>
      )}

      <section className="panel p-4 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center border border-[#705631] bg-[#fff7e5] text-[#352515]">
            <UserRoundPlus size={18} />
          </div>
          <div>
            <p className="label">VOLUNTEER ACCESS</p>
            <h2 className="mt-1 font-cinzel text-lg text-[#291b12]">Create an account</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#51412c]">
              Volunteers can edit checkpoints, teams, settings, and event controls. They cannot manage volunteer accounts.
            </p>
          </div>
        </div>

        <form onSubmit={create} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="label mb-1.5 block">Username</span>
            <input
              className="field min-h-11 bg-[#fffaf0] text-[#21170f]"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9._-]+"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. event.volunteer"
              data-testid="input-volunteer-username"
            />
            <span className="mt-1 block text-xs text-[#51412c]">3–32 letters, numbers, dots, dashes, or underscores.</span>
          </label>
          <label className="block">
            <span className="label mb-1.5 block">Initial password</span>
            <input
              className="field min-h-11 bg-[#fffaf0] text-[#21170f]"
              type="password"
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters"
              data-testid="input-volunteer-password"
            />
            <span className="mt-1 block text-xs text-[#51412c]">Passwords are stored as hashes and never shown in the account list.</span>
          </label>
          <button
            type="submit"
            disabled={createAccount.isPending}
            className="flex min-h-11 items-center justify-center gap-2 border border-[#08152c] bg-[#08152c] px-5 text-sm font-semibold text-[#fff0bf] disabled:opacity-50"
            data-testid="button-create-volunteer"
          >
            {createAccount.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
            Create account
          </button>
        </form>
      </section>

      <section className="panel p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="label">ACCOUNT ROSTER</p>
            <h2 className="mt-1 font-cinzel text-lg text-[#291b12]">Volunteer accounts</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#51412c]">
            <Shield size={15} aria-hidden="true" />
            <span>{accounts.data?.length ?? 0} accounts</span>
          </div>
        </div>

        {accounts.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[#51412c]" role="status">
            <LoaderCircle size={17} className="animate-spin" /> Loading accounts…
          </div>
        ) : accounts.isError ? (
          <div className="border border-[#a63f36] bg-[#fff0eb] p-4 text-sm text-[#702a23]" role="alert">
            <p>{errorMessage(accounts.error)}</p>
            <button
              type="button"
              onClick={() => void accounts.refetch()}
              className="mt-3 min-h-10 border border-[#702a23] px-3 font-medium"
            >
              Try again
            </button>
          </div>
        ) : accounts.data?.length ? (
          <div className="space-y-3">
            {accounts.data.map((account) => (
              <article
                key={account.id}
                className="border border-[#80663f] bg-[#fff7e5] p-4 text-[#291b12]"
                data-testid={`row-volunteer-${account.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{account.username}</p>
                    <p className="mt-1 text-xs text-[#51412c]">Volunteer · full event editing</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFeedback(null);
                        setResetId(resetId === account.id ? null : account.id);
                        setReplacementPassword("");
                      }}
                      className="flex min-h-10 items-center gap-2 border border-[#352515] px-3 text-sm font-medium text-[#291b12]"
                      aria-expanded={resetId === account.id}
                      data-testid={`button-reset-volunteer-${account.id}`}
                    >
                      <KeyRound size={15} />
                      Reset password
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(account.id, account.username)}
                      disabled={deleteAccount.isPending}
                      className="flex min-h-10 items-center gap-2 border border-[#702a23] px-3 text-sm font-medium text-[#702a23] disabled:opacity-50"
                      data-testid={`button-delete-volunteer-${account.id}`}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>

                {resetId === account.id && (
                  <form
                    onSubmit={(event) => void reset(event, account.id)}
                    className="mt-4 grid gap-3 border-t border-[#80663f] pt-4 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <label className="block">
                      <span className="label mb-1.5 block">New password</span>
                      <input
                        className="field min-h-11 bg-[#fffaf0] text-[#21170f]"
                        type="password"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={replacementPassword}
                        onChange={(event) => setReplacementPassword(event.target.value)}
                        data-testid={`input-reset-volunteer-password-${account.id}`}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={resetPassword.isPending}
                      className="flex min-h-11 items-center justify-center gap-2 border border-[#08152c] bg-[#08152c] px-4 text-sm font-semibold text-[#fff0bf] disabled:opacity-50"
                      data-testid={`button-save-volunteer-password-${account.id}`}
                    >
                      {resetPassword.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={15} />}
                      Save password
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[#80663f] bg-[#fff7e5] p-8 text-center">
            <Shield className="mx-auto text-[#51412c]" size={22} />
            <p className="mt-3 font-cormorant text-xl text-[#291b12]">No volunteer accounts yet.</p>
            <p className="mt-1 text-sm text-[#51412c]">Create a separate login for each volunteer who needs the console.</p>
          </div>
        )}
      </section>
    </div>
  );
}

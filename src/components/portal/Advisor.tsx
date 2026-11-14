"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { AccountState } from "@/lib/billing/account";
import { api, errorText } from "@/lib/client/http";
import { formatDate } from "@/lib/client/format";
import type { Conversation, Message } from "@/lib/server/advisor";
import { AppShell } from "../check/AppShell";
import { AlertCircleIcon, ChatIcon, InfoIcon, PlusIcon, SendIcon, Spinner, TrashIcon } from "../Icons";
import { Markdown } from "./Markdown";
import { RequireUser } from "./RequireUser";

export function Advisor() {
  return (
    <AppShell>
      <RequireUser>{() => <AdvisorBody />}</RequireUser>
    </AppShell>
  );
}

function AdvisorBody() {
  const { locale, dict } = useI18n();
  const t = dict.portal.advisor;
  const router = useRouter();
  const params = useSearchParams();
  const checkParam = params.get("check");
  const convParam = params.get("c");

  const [account, setAccount] = useState<AccountState | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const linkedOnce = useRef(false);
  const tmpCounter = useRef(0);

  const loadList = useCallback(async () => {
    const r = await api<{ conversations: Conversation[] }>("/api/advisor/conversations");
    if (r.ok) setConversations(r.data.conversations);
    return r.ok ? r.data.conversations : [];
  }, []);

  const open = useCallback(
    async (id: string) => {
      setError(null);
      const r = await api<{ conversation: Conversation; messages: Message[] }>(`/api/advisor/conversations/${id}`);
      if (r.ok) {
        setActive(r.data.conversation);
        setMessages(r.data.messages);
        router.replace(`/${locale}/advisor?c=${id}`, { scroll: false });
      } else setError(errorText(dict.portal.errors, r.error));
    },
    [locale, router, dict.portal.errors],
  );

  const create = useCallback(
    async (checkId: string | null) => {
      setError(null);
      const r = await api<{ conversation: Conversation }>("/api/advisor/conversations", { body: { checkId } });
      if (!r.ok) {
        setError(errorText(dict.portal.errors, r.error));
        return;
      }
      await loadList();
      await open(r.data.conversation.id);
    },
    [loadList, open, dict.portal.errors],
  );

  useEffect(() => {
    api<{ account: AccountState }>("/api/account/summary").then((r) => r.ok && setAccount(r.data.account));
  }, []);

  useEffect(() => {
    if (!account?.plan.advisorAccess) return;
    void (async () => {
      const list = await loadList();
      if (checkParam && !linkedOnce.current) {
        linkedOnce.current = true;
        // Reuse a conversation already about this check, else start one.
        const existing = list.find((c) => c.checkId === checkParam);
        if (existing) await open(existing.id);
        else await create(checkParam);
      } else if (convParam) await open(convParam);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once the plan is known
  }, [account?.plan.advisorAccess]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || !active || sending) return;
    setSending(true);
    setError(null);
    tmpCounter.current += 1;
    const optimistic: Message = { id: `tmp-${tmpCounter.current}`, role: "user", content, createdAt: "" };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    const r = await api<{ user: Message; assistant: Message }>(`/api/advisor/conversations/${active.id}/messages`, { body: { content, locale } });
    setSending(false);
    if (r.ok) {
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), r.data.user, r.data.assistant]);
      void loadList();
    } else {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(content); // keep the question so it can be resent
      setError(errorText(dict.portal.errors, r.error));
    }
  }

  async function remove(id: string) {
    const r = await api(`/api/advisor/conversations/${id}`, { method: "DELETE" });
    if (r.ok) {
      if (active?.id === id) {
        setActive(null);
        setMessages([]);
        router.replace(`/${locale}/advisor`, { scroll: false });
      }
      void loadList();
    }
  }

  if (!account) return <p className="portal-loading" role="status">{dict.portal.common.loading}</p>;
  if (!account.plan.advisorAccess) {
    return (
      <section className="portal-empty" aria-labelledby="adv-locked">
        <ChatIcon size={32} />
        <h1 id="adv-locked" className="page-title">{t.notInPlanTitle}</h1>
        <p className="page-subtitle">{t.notInPlanText}</p>
        <Link className="btn btn--primary" href={`/${locale}/pricing`}>{t.upgrade}</Link>
      </section>
    );
  }

  return (
    <section className="advisor" aria-labelledby="adv-title">
      <div className="page-head">
        <div>
          <h1 id="adv-title" className="page-title">{t.title}</h1>
          <p className="page-subtitle">{t.subtitle}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void create(null)}>
          <PlusIcon size={18} />
          {t.newChat}
        </button>
      </div>

      <div className="advisor__layout">
        <aside className="advisor__list" aria-label={t.conversations}>
          {conversations === null ? (
            <p className="portal-loading">{dict.portal.common.loading}</p>
          ) : conversations.length === 0 ? (
            <p className="fine-print">{t.empty}</p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id} className={active?.id === c.id ? "is-active" : undefined}>
                  <button type="button" className="advisor__conv" onClick={() => void open(c.id)} aria-current={active?.id === c.id ? "true" : undefined}>
                    <span className="advisor__conv-title">{c.title || t.untitled}</span>
                    <span className="advisor__conv-meta">{c.checkId ? format(t.linked, { date: formatDate(c.createdAt, locale) }) : formatDate(c.updatedAt, locale)}</span>
                  </button>
                  <button type="button" className="icon-btn advisor__delete" aria-label={`${t.delete}: ${c.title || t.untitled}`} onClick={() => void remove(c.id)}>
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="advisor__chat">
          {!active ? (
            <div className="portal-empty portal-empty--inline">
              <ChatIcon size={28} />
              <p>{t.pickConversation}</p>
            </div>
          ) : (
            <>
              {active.checkId && (
                <p className="advisor__linked">
                  <InfoIcon size={16} />
                  <Link href={`/${locale}/checks/${active.checkId}`}>{format(t.linked, { date: formatDate(active.createdAt, locale) })}</Link>
                </p>
              )}
              <div className="advisor__messages" aria-live="polite">
                {messages.length === 0 && <p className="advisor__welcome">{t.welcome}</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`bubble bubble--${m.role}`}>
                    <span className="visually-hidden">{m.role === "user" ? t.you : t.assistant}: </span>
                    {m.role === "assistant" ? <Markdown text={m.content} /> : <p>{m.content}</p>}
                  </div>
                ))}
                {sending && (
                  <div className="bubble bubble--assistant bubble--pending" role="status">
                    <Spinner size={18} /> {t.sending}
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {messages.length === 0 && (
                <div className="advisor__suggestions">
                  {t.suggestions.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => void send(s)} disabled={sending}>{s}</button>
                  ))}
                </div>
              )}

              {error && <p className="form-message form-message--error" role="alert"><AlertCircleIcon size={18} /><span>{error}</span></p>}

              <form
                className="advisor__composer"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void send(draft);
                }}
              >
                <label className="visually-hidden" htmlFor="advisor-input">{t.placeholder}</label>
                <textarea
                  id="advisor-input"
                  className="field__input advisor__input"
                  value={draft}
                  placeholder={t.placeholder}
                  maxLength={4000}
                  rows={2}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                />
                <button type="submit" className="btn btn--primary" disabled={sending || !draft.trim()} aria-label={t.send}>
                  <SendIcon size={18} />
                  <span className="advisor__send-label">{t.send}</span>
                </button>
              </form>
            </>
          )}
          <p className="fine-print advisor__disclaimer"><InfoIcon size={16} />{t.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}

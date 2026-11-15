"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api, errorText } from "@/lib/client/http";
import { newId, updateDemoData, useDemoAccount, useDemoData, type DemoChat, type DemoMessage } from "@/lib/client/demo";
import { formatDate } from "@/lib/client/format";
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

  const account = useDemoAccount();
  const data = useDemoData();
  const [activeId, setActiveId] = useState<string | null>(convParam);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const linkedOnce = useRef(false);

  const conversations = data?.chats ?? null;
  const active = conversations?.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  const open = useCallback(
    (id: string) => {
      setError(null);
      setActiveId(id);
      router.replace(`/${locale}/advisor?c=${id}`, { scroll: false });
    },
    [locale, router],
  );

  const create = useCallback(
    (checkId: string | null) => {
      setError(null);
      const now = new Date().toISOString();
      const chat: DemoChat = { id: newId(), title: "", checkId, createdAt: now, updatedAt: now, messages: [] };
      updateDemoData((d) => ({ ...d, chats: [chat, ...d.chats] }));
      open(chat.id);
    },
    [open],
  );

  // Arriving from a check result: reuse the chat about that check, or start one.
  useEffect(() => {
    if (!account?.plan.advisorAccess || !data || !checkParam || linkedOnce.current) return;
    linkedOnce.current = true;
    const existing = data.chats.find((c) => c.checkId === checkParam);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time redirect into the chat for this check
    if (existing) open(existing.id);
    else create(checkParam);
  }, [account?.plan.advisorAccess, data, checkParam, open, create]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || !active || sending) return;
    const chatId = active.id;
    const userMsg: DemoMessage = { id: newId(), role: "user", content, createdAt: new Date().toISOString() };
    const history = [...active.messages, userMsg].slice(-20).map((m) => ({ role: m.role, content: m.content }));
    const linked = active.checkId ? data?.checks.find((c) => c.id === active.checkId) : undefined;
    setSending(true);
    setError(null);
    setDraft("");
    updateDemoData((d) => ({
      ...d,
      chats: d.chats.map((c) => (c.id === chatId ? { ...c, title: c.title || content.slice(0, 60), updatedAt: userMsg.createdAt, messages: [...c.messages, userMsg] } : c)),
    }));
    const r = await api<{ reply: string }>("/api/advisor", {
      body: {
        locale,
        messages: history,
        check: linked ? { createdAt: linked.createdAt, documentNames: linked.documentNames, extractions: linked.extractions } : null,
      },
    });
    setSending(false);
    if (r.ok) {
      const reply: DemoMessage = { id: newId(), role: "assistant", content: r.data.reply, createdAt: new Date().toISOString() };
      updateDemoData((d) => ({ ...d, chats: d.chats.map((c) => (c.id === chatId ? { ...c, updatedAt: reply.createdAt, messages: [...c.messages, reply] } : c)) }));
    } else {
      updateDemoData((d) => ({ ...d, chats: d.chats.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== userMsg.id) } : c)) }));
      setDraft(content); // keep the question so it can be resent
      setError(errorText(dict.portal.errors, r.error));
    }
  }

  function remove(id: string) {
    updateDemoData((d) => ({ ...d, chats: d.chats.filter((c) => c.id !== id) }));
    if (activeId === id) {
      setActiveId(null);
      router.replace(`/${locale}/advisor`, { scroll: false });
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
        <button type="button" className="btn btn--primary" onClick={() => create(null)}>
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
                  <button type="button" className="advisor__conv" onClick={() => open(c.id)} aria-current={active?.id === c.id ? "true" : undefined}>
                    <span className="advisor__conv-title">{c.title || t.untitled}</span>
                    <span className="advisor__conv-meta">{c.checkId ? format(t.linked, { date: formatDate(c.createdAt, locale) }) : formatDate(c.updatedAt, locale)}</span>
                  </button>
                  <button type="button" className="icon-btn advisor__delete" aria-label={`${t.delete}: ${c.title || t.untitled}`} onClick={() => remove(c.id)}>
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

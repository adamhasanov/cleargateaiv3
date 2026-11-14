import Link from "next/link";
import { notFound } from "next/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import {
  ArrowRightIcon, BriefcaseIcon, ClockIcon, CompareIcon, LayersIcon, MailIcon, PlayIcon, ShieldIcon, UploadIcon,
} from "@/components/Icons";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getDictionary, isLocale } from "@/i18n/config";

const BENEFIT_ICONS = [CompareIcon, ShieldIcon, LayersIcon, BriefcaseIcon];

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <>
      <SiteHeader />
      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <HeroBackground />
          <div className="container hero__content">
            <p className="eyebrow">{dict.hero.eyebrow}</p>
            <h1 id="hero-title" className="hero__title">
              {dict.hero.titleLead} <span className="hero__accent">{dict.hero.titleAccent}</span>
            </h1>
            <p className="hero__lead">{dict.hero.description}</p>
            <div className="hero__actions">
              <Link href={`/${lang}/check`} className="btn btn--primary btn--lg">
                <UploadIcon size={20} />
                {dict.hero.primaryCta}
              </Link>
              <a href="#how" className="btn btn--ghost btn--lg">
                <PlayIcon size={22} />
                {dict.hero.secondaryCta}
              </a>
            </div>
          </div>
          <div className="container">
            <ul className="benefits" aria-label={dict.nav.advantages}>
              {dict.benefits.map((b, i) => {
                const Icon = BENEFIT_ICONS[i];
                return (
                  <li key={b.title} className="benefit">
                    <Icon size={30} className="benefit__icon" />
                    <div>
                      <h2 className="benefit__title">{b.title}</h2>
                      <p className="benefit__text">{b.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="how" className="section" aria-labelledby="how-title">
          <div className="container">
            <h2 id="how-title" className="section__title">{dict.how.title}</h2>
            <p className="section__intro">{dict.how.intro}</p>
            <ol className="steps">
              {dict.how.steps.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step__num" aria-hidden="true">{i + 1}</span>
                  <h3 className="step__title">{s.title}</h3>
                  <p className="step__text">{s.text}</p>
                </li>
              ))}
            </ol>
            <Link href={`/${lang}/check`} className="btn btn--primary steps-cta">
              {dict.nav.startCheck}
              <ArrowRightIcon size={18} />
            </Link>
          </div>
        </section>

        <section id="advantages" className="section section--alt" aria-labelledby="adv-title">
          <div className="container">
            <h2 id="adv-title" className="section__title">{dict.advantages.title}</h2>
            <p className="section__intro">{dict.advantages.intro}</p>
            <div className="card-grid">
              {dict.advantages.items.map((a) => (
                <article key={a.title} className="card">
                  <h3 className="card__title">{a.title}</h3>
                  <p className="card__text">{a.text}</p>
                </article>
              ))}
            </div>
            <h3 className="subhead">
              <ClockIcon size={20} />
              {dict.advantages.plannedTitle}
            </h3>
            <div className="card-grid card-grid--3">
              {dict.advantages.planned.map((p) => (
                <article key={p.title} className="card card--planned">
                  <h4 className="card__title">{p.title}</h4>
                  <p className="card__text">{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="section" aria-labelledby="about-title">
          <div className="container about">
            <div>
              <h2 id="about-title" className="section__title">{dict.about.title}</h2>
              {dict.about.paragraphs.map((p) => (
                <p key={p} className="about__text">{p}</p>
              ))}
            </div>
            <aside className="about__aside">
              <p className="about__slogan">{dict.about.slogan}</p>
              <p className="about__contact">
                <MailIcon size={18} />
                <span>{dict.about.contactLabel}:</span>
                <a href="mailto:cleargateai@gmail.com">cleargateai@gmail.com</a>
              </p>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter dict={dict} locale={lang} />
    </>
  );
}

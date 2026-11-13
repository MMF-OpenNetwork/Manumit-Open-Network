"use client";

import { useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { SectionReveal } from "@/components/ui/SectionReveal";
import { siteConfig } from "@/data/site-config";

type SubmitState = "idle" | "loading" | "success" | "error";

export default function ContactPage() {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitState("loading");
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("contact-name") as HTMLInputElement).value,
      email: (form.elements.namedItem("contact-email") as HTMLInputElement).value,
      role: (form.elements.namedItem("contact-role") as HTMLSelectElement).value,
      message: (form.elements.namedItem("contact-message") as HTMLTextAreaElement).value,
      _hp: (form.elements.namedItem("_hp") as HTMLInputElement).value,
    };
    if (data._hp) { setSubmitState("idle"); return; }
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Submission failed"); }
      setSubmitState("success");
    } catch (err: any) {
      setSubmitState("error");
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="bg-ivory min-h-screen pt-24">
      {/* Header */}
      <section className="relative py-16 lg:py-24 border-b border-ink/8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-ivory via-cream to-forest/6" />
        <div className="container-wide relative text-center">
          <SectionReveal>
            <p className="text-gold text-xs font-semibold tracking-widest uppercase mb-3">Get Involved</p>
            <div className="section-divider" />
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-ink mb-4">
              Join the{" "}
              <span className="text-forest-gradient">Mission</span>
            </h1>
            <p className="text-ink/65 max-w-xl mx-auto text-lg">
              Whether you&apos;re an investor, community advocate, or potential partner — we&apos;d love
              to hear from you. The presale opens September 21, 2026.
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* Contact form + info */}
      <section className="py-20 lg:py-28">
        <div className="container-wide">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 max-w-5xl mx-auto">
            {/* Left: form */}
            <SectionReveal direction="left" className="lg:col-span-3">
              <div className="rounded-2xl border border-forest/20 bg-white p-8 lg:p-10">
                {submitState === "success" ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-10"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald/15 border border-emerald/30
                      flex items-center justify-center mx-auto mb-5">
                      <svg className="w-8 h-8 text-emerald" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-ink mb-3">Message Received!</h2>
                    <p className="text-ink/60 text-sm max-w-sm mx-auto">
                      Thank you for reaching out. A member of our team will respond within 2–3 business days.
                      In the meantime, join us on Telegram for real-time updates.
                    </p>
                    <a
                      href={siteConfig.social.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl border border-gold/25
                        text-gold text-sm font-semibold hover:bg-gold/10 transition-all"
                    >
                      Join Our Telegram →
                    </a>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} noValidate>
                    <h2 className="font-display text-2xl font-bold text-ink mb-6">
                      Contact &amp; Waitlist Registration
                    </h2>

                    {/* Honeypot */}
                    <div className="sr-only" aria-hidden="true">
                      <input type="text" name="_hp" tabIndex={-1} autoComplete="off" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label htmlFor="contact-name" className="block text-sm font-medium text-ink/75 mb-1.5">
                          Full Name <span className="text-ruby">*</span>
                        </label>
                        <input
                          id="contact-name"
                          name="contact-name"
                          type="text"
                          required
                          autoComplete="name"
                          className="w-full px-4 py-3 rounded-xl bg-white border border-ink/15 text-ink
                            placeholder-ink/35 focus:outline-none focus:border-forest/50 transition-colors text-sm"
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <label htmlFor="contact-email" className="block text-sm font-medium text-ink/75 mb-1.5">
                          Email Address <span className="text-ruby">*</span>
                        </label>
                        <input
                          id="contact-email"
                          name="contact-email"
                          type="email"
                          required
                          autoComplete="email"
                          className="w-full px-4 py-3 rounded-xl bg-white border border-ink/15 text-ink
                            placeholder-ink/35 focus:outline-none focus:border-forest/50 transition-colors text-sm"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="contact-role" className="block text-sm font-medium text-ink/75 mb-1.5">
                        I&apos;m interested as a…
                      </label>
                      <select
                        id="contact-role"
                        name="contact-role"
                        className="w-full px-4 py-3 rounded-xl bg-white border border-ink/15 text-ink
                          focus:outline-none focus:border-forest/50 transition-colors text-sm
                          [&>option]:bg-white"
                      >
                        <option value="general">General supporter</option>
                        <option value="investor">Investor / Token buyer</option>
                        <option value="community">Community member / Advocate</option>
                        <option value="partner">Partner / Organization</option>
                        <option value="press">Press / Media</option>
                        <option value="advisor">Advisor</option>
                      </select>
                    </div>

                    <div className="mb-6">
                      <label htmlFor="contact-message" className="block text-sm font-medium text-ink/75 mb-1.5">
                        Message <span className="text-ink/40">(optional)</span>
                      </label>
                      <textarea
                        id="contact-message"
                        name="contact-message"
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl bg-white border border-ink/15 text-ink
                          placeholder-ink/35 focus:outline-none focus:border-forest/50 transition-colors
                          text-sm resize-none"
                        placeholder="Tell us how you'd like to be involved, ask a question, or introduce yourself…"
                      />
                    </div>

                    {submitState === "error" && (
                      <p className="text-ruby-light text-sm mb-4 bg-ruby/10 border border-ruby/20 rounded-lg px-4 py-2">
                        {errorMsg}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitState === "loading"}
                      className="w-full py-4 rounded-xl bg-forest-gradient text-white font-bold text-sm
                        shadow-forest hover:shadow-forest-lg hover:brightness-110 transition-all duration-300
                        disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitState === "loading" ? "Sending…" : "Send Message & Join Waitlist →"}
                    </button>

                    <p className="text-center text-xs text-ink/40 mt-3">
                      Your information is never sold or shared with third parties.
                    </p>
                  </form>
                )}
              </div>
            </SectionReveal>

            {/* Right: contact info */}
            <SectionReveal direction="right" className="lg:col-span-2">
              <div className="space-y-6">
                {/* Presale date card */}
                <div className="rounded-2xl border border-emerald/25 bg-emerald/5 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
                    <span className="text-emerald-dark text-xs font-semibold uppercase tracking-wider">
                      Token Sale Timeline
                    </span>
                  </div>
                  <p className="text-ink font-semibold mb-1">Presale Round 1</p>
                  <p className="text-gold font-display font-bold text-xl mb-3">December 7, 2026</p>
                  <p className="text-ink/60 text-xs">Round 2 opens December 21, 2026</p>
                </div>

                {/* Social links */}
                <div className="rounded-2xl border border-ink/10 bg-white p-6">
                  <h3 className="font-display text-sm font-bold text-ink mb-4 uppercase tracking-wider">
                    Community Channels
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: "Twitter / X", href: siteConfig.social.twitter, icon: "𝕏", desc: "@manumit_me" },
                      { label: "Telegram", href: siteConfig.social.telegram, icon: "✈", desc: "t.me/manumitme" },
                      { label: "Discord", href: siteConfig.social.discord, icon: "💬", desc: "Join the server" },
                      { label: "Instagram", href: siteConfig.social.instagram, icon: "📸", desc: "@manumit_me" },
                    ].map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 group"
                      >
                        <span className="w-8 h-8 rounded-lg border border-ink/10 bg-ink/3 flex items-center
                          justify-center text-sm group-hover:border-forest/25 group-hover:bg-forest/5 transition-all">
                          {s.icon}
                        </span>
                        <div>
                          <p className="text-ink/75 text-sm group-hover:text-forest-dark transition-colors font-medium">
                            {s.label}
                          </p>
                          <p className="text-ink/40 text-xs">{s.desc}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Response time */}
                <div className="rounded-xl border border-ink/10 bg-white p-5">
                  <p className="text-ink/50 text-xs leading-relaxed">
                    📩 <strong className="text-ink/70">Response time:</strong> 2–3 business days.
                    For urgent inquiries, Telegram is the fastest way to reach us.
                  </p>
                </div>
              </div>
            </SectionReveal>
          </div>
        </div>
      </section>
    </div>
  );
}

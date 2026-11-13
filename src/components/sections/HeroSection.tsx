"use client";

import { motion, Variants } from "framer-motion";
import Image from "next/image";
import { TokenPurchaseCTA } from "@/components/ui/TokenPurchaseCTA";
import { Button } from "@/components/ui/Button";
import { siteConfig } from "@/data/site-config";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

export function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden bg-hero-gradient"
      aria-label="Hero"
    >
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Radial glow behind coin */}
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[600px] h-[600px] rounded-full
          bg-gold/8 blur-[120px]" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full
          bg-forest/8 blur-[100px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(27,122,50,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(27,122,50,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="container-wide w-full py-28 lg:pt-32 lg:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-6 items-center min-h-screen">
          {/* Left, text content */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="relative z-10"
          >
            {/* Headline */}
            <motion.h1
              variants={itemVariants}
              className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.15] mb-4"
            >
              <span className="text-ink">Empowering</span>
              <br />
              <span className="text-forest-gradient">Compassion</span>
              <br />
              <span className="text-ink">Through Action</span>
            </motion.h1>

            {/* Token tagline */}
            <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
              <div className="relative w-8 h-8">
                <Image src="/logos/mmc-coin.png" alt="MMC Token" fill className="object-contain" />
              </div>
              <div>
                <span className="text-gold font-semibold text-sm">MANUMIT CORE (MMC)</span>
                <span className="text-ink/40 mx-2">·</span>
                <span className="text-ink/60 text-sm italic">Compassion Multiplied</span>
              </div>
            </motion.div>

            {/* Description */}
            <motion.p
              variants={itemVariants}
              className="text-ink/65 text-lg leading-relaxed max-w-lg mb-8"
            >
              A mission-driven ERC-20 token powering real-world advocacy, community accountability,
              and collective action. Built on Ethereum. Rooted in purpose.
            </motion.p>

            {/* CTA buttons */}
            <motion.div variants={itemVariants} className="flex flex-wrap gap-4 mb-10">
              <TokenPurchaseCTA label="Join the Waitlist" action="waitlist" size="lg" />
              <Button
                variant="secondary"
                size="lg"
                href={siteConfig.whitepaperUrl}
                isExternal
              >
                Read the Whitepaper
              </Button>
            </motion.div>

            {/* Presale date banner */}
            <motion.div variants={itemVariants}>
              <div className="inline-flex items-center gap-3 px-4 py-3 rounded-xl
                border border-emerald/25 bg-emerald/8">
                <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
                <span className="text-emerald-dark text-sm font-medium">
                  Round 1 opens <strong className="text-ink">December 7, 2026</strong>
                  <span className="text-ink/40 mx-2">·</span>
                  Round 2 opens <strong className="text-ink">March  7, 2026</strong>
                </span>
              </div>
            </motion.div>

            {/* Stats row */}
            <motion.div variants={itemVariants} className="flex flex-wrap gap-6 mt-10 pt-8 border-t border-ink/10">
              {[
                { label: "Presale Supply", value: "2B MMC" },
                { label: "Blockchain", value: "Ethereum" },
                { label: "Token Standard", value: "ERC-20" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-xl font-display font-bold text-gold">{stat.value}</div>
                  <div className="text-xs text-ink/45 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right, coin graphic */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, rotateY: -15 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="flex items-center justify-center relative z-10"
          >
            <div className="relative">
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-full bg-gold/20 blur-3xl scale-110 animate-pulse-gold" />

              {/* Main coin image */}
              <motion.div
                animate={{ y: [0, -16, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative w-[260px] h-[260px] sm:w-[400px] sm:h-[400px] lg:w-[500px] lg:h-[500px]"
              >
                <Image
                  src="/logos/mmc-coin.png"
                  alt="MANUMIT CORE (MMC) Token"
                  fill
                  className="object-contain drop-shadow-[0_0_60px_rgba(207,181,59,0.45)]"
                  priority
                />
              </motion.div>

              {/* Floating badges */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="absolute top-4 -left-4 sm:top-8 sm:-left-8 glass-light rounded-xl px-3 py-2.5 border border-gold/20"
              >
                <p className="text-gold text-xs font-semibold">⛓️ ERC-20</p>
                <p className="text-ink/55 text-[10px]">Ethereum Mainnet</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 }}
                className="absolute bottom-8 -right-2 sm:bottom-12 sm:-right-6 glass-light rounded-xl px-3 py-2.5 border border-forest/25"
              >
                <p className="text-forest-dark text-xs font-semibold">🏛️ Foundation</p>
                <p className="text-ink/55 text-[10px]">Mission-Driven</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-ink/35 text-xs tracking-widest uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-8 bg-gradient-to-b from-forest/50 to-transparent"
        />
      </motion.div>
    </section>
  );
}

import { Locale } from "discord.js";
import { env } from "../config/env.js";
import { messages, type MessageKey, type SupportedLocale } from "./messages.js";

export function normalizeLocale(locale?: string | null): SupportedLocale {
  const raw = (locale ?? env.BOT_LOCALE).toLowerCase();
  if (raw.startsWith("ko")) return "ko";
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("en")) return "en";
  return env.BOT_LOCALE;
}

export function t(locale: string | null | undefined, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const selected = normalizeLocale(locale);
  const template = messages[selected][key] ?? messages.en[key];
  return Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

export function commandLocalizations(ko: string, en: string, zh: string): { description: string; localizations: Record<string, string> } {
  return {
    description: ko,
    localizations: {
      [Locale.Korean]: ko,
      [Locale.EnglishUS]: en,
      [Locale.EnglishGB]: en,
      [Locale.ChineseCN]: zh,
      [Locale.ChineseTW]: zh
    }
  };
}

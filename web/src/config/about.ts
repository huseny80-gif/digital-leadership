/**
 * Static "About / من نحن" content — plain application-level config, not
 * database-backed (per the task's own guidance: this mirrors the source
 * `Finquiz` project's `data/config/about.js` / `contact.js` pattern,
 * which is also plain static config, not a database table). No schema
 * change was needed or made for this.
 *
 * Values are copied verbatim from the verified source
 * (`huseny80-gif/Finquiz` @ b737ce31883bf86b3ab461b0238eb496d6e117b3,
 * `data/config/about.js` and `data/config/contact.js`) — nothing here is
 * invented or guessed. No address field exists in that source, so none
 * is included here.
 *
 * Every value is rendered as plain text (React's default JSX
 * interpolation) wherever it's used — never `dangerouslySetInnerHTML`.
 */

export const aboutProfile = {
  name: "حسين ياسين حسن",
  jobTitle: "ر. مهندسين أقدم",
  role: "إعداد وتنظيم المحتوى وبناء المنصة",
  bio: "يشرف على تجميع مواد الكورس وتحريرها وتحديثها دورياً بما يتوافق مع مفردات المنهج.",
  facts: [
    "المؤهل العلمي: بكالوريوس هندسة المساحة — كلية الهندسة، جامعة بغداد",
    "جهة العمل: وزارة النفط — شركة الاستكشافات النفطية — الفرقة الزلزالية السابعة",
  ],
  // Copied from the source repository's assets — see
  // web/src/app/about/page.tsx's own header comment for why this ships
  // as a text placeholder rather than a copied binary in this change.
  photoPath: "/about/hussein-profile.webp",
} as const;

export const contactInfo = {
  phone: "+9647706003138",
  whatsapp: "9647706003138",
  email: "huseny80@gmail.com",
} as const;

/** Channels the source config lists with a `null` value — rendered
 * disabled/"قريباً", never with a real href (never fabricated). */
export const comingSoonChannels = ["Telegram", "LinkedIn", "Facebook"] as const;

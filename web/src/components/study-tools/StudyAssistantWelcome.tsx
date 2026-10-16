"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import styles from "./studyTools.module.css";

export const STUDY_ASSISTANT_GREETING = "أهلاً بك، كيف يمكنني مساعدتك";
export const STUDY_ASSISTANT_WELCOME_TITLE = "مرحباً بك في مساعدك الدراسي الذكي";

/** The native modal keeps background navigation inert until the visitor
 * chooses a destination. No conversation or model request starts on entry. */
export function StudyAssistantWelcome({ onChoose }: { onChoose: (destination: "platform" | "assistant") => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    heading.current?.focus();
    return () => {
      if (modal.open) modal.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function choose(destination: "platform" | "assistant") {
    if (dialog.current?.open) dialog.current.close();
    onChoose(destination);
  }

  return <dialog ref={dialog} dir="rtl" className={styles.welcomeDialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); choose("platform"); }}>
    <span className={styles.welcomeBadge} aria-hidden="true">🎓✨</span>
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{STUDY_ASSISTANT_WELCOME_TITLE}</h2>
    <p id={`${id}-description`} className={styles.welcomeDescription}>منصتك المتكاملة لتنظيم المحاضرات، استعراض المواد الدراسية، وتسهيل رحلتك الأكاديمية بكفاءة واحترافية.</p>
    <div className={styles.welcomeFeedback}>
      <p className={styles.welcomeInvitation}>بكم نرتقي ونتطور. شاركنا رأيك ولا تبخل علينا بأفكارك وملاحظاتك لتطوير محتوى المنصة.</p>
      <p>اذهب إلى تبويب <Link href="/feedback" prefetch={false} onNavigate={() => choose("platform")}><strong>«شاركنا رأيك»</strong></Link> واكتب ما يجول في خاطرك بدون أي تحفظ. المشاركات تصل بدون اسم للحفاظ على السرية الشخصية. <span aria-hidden="true">🔒</span></p>
    </div>
    <p className={styles.welcomeEyebrow}>{STUDY_ASSISTANT_GREETING}</p>
    <div className={styles.welcomeChoices}>
      <button type="button" className={styles.welcomeChoice} aria-labelledby={`${id}-platform`} aria-describedby={`${id}-platform-description`} onClick={() => choose("platform")}><PlatformIcon name="book" /><strong id={`${id}-platform`}>تصفح المنصة</strong><span id={`${id}-platform-description`}>المواد والمحاضرات والملخصات والاختبارات</span></button>
      <button type="button" className={styles.welcomeChoice} data-destination="assistant" aria-labelledby={`${id}-assistant`} aria-describedby={`${id}-assistant-description`} onClick={() => choose("assistant")}><PlatformIcon name="assistant" /><strong id={`${id}-assistant`}>استخدام المساعد الدراسي</strong><span id={`${id}-assistant-description`}>اطرح سؤالك أو اطلب تلخيصًا أو مراجعة</span></button>
    </div>
  </dialog>;
}

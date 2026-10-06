import Link from "next/link";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { PlatformIcon } from "@/components/ui/PlatformIcon";

export default function FeedbackPage() {
  return <section className="participant-feedback" dir="rtl">
    <header className="feedback-heading"><span className="feedback-heading-icon"><PlatformIcon name="feedback" /></span><div><h1>شاركنا رأيك</h1><p>رأيك يساعدنا على تطوير منصة القيادة الرقمية وتحسين تجربتك.</p></div></header>
    <div className="feedback-panel">
      <p className="feedback-privacy" id="feedback-privacy">تُرسل ملاحظتك بسرية إلى الإدارة والمدربين، ولا تظهر لبقية المشاركين.</p>
      <FeedbackForm />
    </div>
    <Link className="feedback-back" href="/dashboard">← الرجوع إلى الرئيسية</Link>
  </section>;
}

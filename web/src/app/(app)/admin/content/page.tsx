import { SmartContentUpload } from "@/components/admin/SmartContentUpload";

export default function AdminContentPage() {
  return <section><h1 className="page-heading">تحديث المحتوى الدراسي</h1><p className="page-subheading">أضف المحتوى في أي وقت ليُحفظ ويُصنَّف وتُحدَّث اختباراته تلقائيًا.</p><SmartContentUpload /></section>;
}

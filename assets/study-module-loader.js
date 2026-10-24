"use strict";
(() => {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const checksum = /^[a-f0-9]{64}$/;
  const voiceIds = ["msa-male", "msa-female", "iraqi-male", "iraqi-female", "saudi-male", "saudi-female"];
  const formats = ["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"];
  const string = value => typeof value === "string" && value.trim().length > 0;
  function validate(data, subject, kind) {
    if (!data || data.live !== true || data.subjectId !== subject || !string(data.courseTitle) || !checksum.test(data.revision) || !Array.isArray(data.lectures) || !Array.isArray(data.unavailableLectures)) throw new Error("invalid_course");
    const ids = new Set(), numbers = new Set(), lectureIds = new Set();
    for (const lecture of data.lectures) {
      if (!string(lecture.id) || !/^[a-z]+-\d{2,3}$/.test(lecture.id) || ids.has(lecture.id) || !uuid.test(lecture.lectureId) || lectureIds.has(lecture.lectureId) || !Number.isInteger(lecture.number) || lecture.number < 1 || numbers.has(lecture.number) || !string(lecture.title) || !string(lecture.filename) || !checksum.test(lecture.sha256) || !checksum.test(lecture.summarySha256) || !string(lecture.transcript) || !Array.isArray(lecture.sections) || !lecture.sections.length) throw new Error("invalid_lecture");
      if (lecture.sourceHref !== `/subjects/${subject}/lectures/${lecture.lectureId}` || lecture.audioUrl !== `/api/study-modules/${subject}/${lecture.lectureId}/audio.mp3?revision=${lecture.summarySha256}`) throw new Error("cross_course_source");
      if (lecture.sections.some(section => !string(section.heading) || !Array.isArray(section.points) || !section.points.length || section.points.some(point => !string(point.term) || !string(point.text)))) throw new Error("invalid_summary");
      ids.add(lecture.id); numbers.add(lecture.number); lectureIds.add(lecture.lectureId);
    }
    if (data.unavailableLectures.some(item => !uuid.test(item.lectureId) || !string(item.title) || !string(item.reason))) throw new Error("invalid_status");
    if (kind === "summaries") {
      if (!Array.isArray(data.voices) || JSON.stringify(data.voices.map(voice => voice.id)) !== JSON.stringify(voiceIds) || data.voices.some(voice => !string(voice.label))) throw new Error("invalid_voices");
    } else {
      if (!Array.isArray(data.questions) || !Array.isArray(data.references)) throw new Error("invalid_exam");
      if (data.references.some(reference => !lectureIds.has(reference.lectureId) || !checksum.test(reference.sha256) || !string(reference.filename) || !string(reference.excerpt) || !Number.isInteger(reference.startLine) || !Number.isInteger(reference.endLine) || reference.startLine < 1 || reference.endLine < reference.startLine)) throw new Error("invalid_reference");
      const questions = new Set();
      for (const question of data.questions) {
        if (!/^[a-f0-9]{24}$/.test(question.id) || questions.has(question.id) || !numbers.has(question.lecture) || !formats.includes(question.type) || !["easy", "medium", "hard", "very_hard"].includes(question.level) || !string(question.prompt) || !string(question.explanation) || !Array.isArray(question.references) || !question.references.length || question.references.some(index => !Number.isInteger(index) || index < 0 || index >= data.references.length)) throw new Error("invalid_question");
        if (["multiple_choice", "true_false"].includes(question.type) && (!Array.isArray(question.options) || question.options.length < 2 || question.options.some(option => !string(option)) || !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length)) throw new Error("invalid_answer_key");
        if (question.type === "match" && (!Array.isArray(question.pairs) || question.pairs.length < 2 || question.pairs.some(pair => !string(pair.left) || !string(pair.right)))) throw new Error("invalid_matching");
        if (question.type === "order" && (!Array.isArray(question.items) || question.items.length < 2 || question.items.some(item => !string(item)))) throw new Error("invalid_order");
        if (["essay", "short_scenario"].includes(question.type) && (!Array.isArray(question.model) || !question.model.length || question.model.some(item => !string(item)))) throw new Error("invalid_model_answer");
        questions.add(question.id);
      }
    }
    return data;
  }
  async function load(kind) {
    const main = document.getElementById("main");
    main.hidden = true;
    const status = document.createElement("section");
    status.className = "shell notice"; status.id = "study-load-status"; status.setAttribute("role", "status");
    status.textContent = "جارٍ تحميل المحتوى المعتمد لهذه المادة…";
    main.before(status);
    document.querySelector(".platform-link").href = "https://web-husen4.vercel.app/subjects";
    document.querySelector("footer p").textContent = "منصة القيادة الرقمية";
    const params = new URLSearchParams(location.search), subject = params.get("subject");
    let responseStatus = 0;
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), 30000);
    try {
      if (params.getAll("subject").length !== 1 || !uuid.test(subject || "")) throw new Error("invalid_subject");
      const parent = `/subjects/${subject}${kind === "exam" ? "/exam-material" : ""}`;
      document.querySelector(".platform-link").href = "https://web-husen4.vercel.app" + parent;
      if (location.hostname.endsWith(".github.io")) throw new Error("platform_required");
      // A course is prepared once after each deployment; the server answers
      // 503 "study_module_preparing" instead of holding the page, so wait and
      // retry with a visible message rather than spinning without feedback.
      let response;
      for (let attempt = 0; ; attempt++) {
        response = await fetch(`/api/study-modules/${subject}/${kind}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (response.status !== 503 || attempt >= 8 || (await response.clone().json().catch(() => null))?.error?.code !== "study_module_preparing") break;
        clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30000);
        status.textContent = "جارٍ تجهيز محتوى هذه المادة لأول مرة بعد التحديث… ستُعاد المحاولة تلقائيًا.";
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      responseStatus = response.status;
      if (!response.ok) throw new Error("course_unavailable");
      const data = validate((await response.json()).data, subject, kind);
      document.querySelector("main .eyebrow").textContent = data.courseTitle;
      document.title = (kind === "exam" ? "الاختبار الشامل" : "الملخصات والبودكاست") + " — " + data.courseTitle;
      document.querySelector("footer p").textContent = kind === "exam" ? "مراجعة ذاتية من محاضرات هذه المادة. تبقى الإجابات على هذا الجهاز ولا تُرسل إلى سجل الدرجات." : "المراجعة الصوتية مولّدة آليًا من نص الملخص نفسه؛ تُجهز عند التشغيل. تُحفظ تفضيلات الاستماع على هذا الجهاز.";
      if (kind === "summaries") document.querySelector(".audio-disclosure").textContent = "مراجعة بصوت عصبي مولّد آليًا، وليست تسجيلًا بشريًا. يُقرأ نص الملخص بالفصحى بأصوات رجالية ونسائية، وبلكنات عراقية وسعودية، دون تغيير محتواه العلمي.";
      status.remove(); delete document.documentElement.dataset.studyLoading; main.hidden = false;
      if (data.unavailableLectures.length) {
        const notice = document.createElement("section"); notice.className = "notice"; notice.setAttribute("aria-label", "محاضرات تحتاج مراجعة");
        const title = document.createElement("strong"); title.textContent = "محاضرات تحتاج مراجعة ملفاتها";
        const list = document.createElement("ul");
        data.unavailableLectures.forEach(lecture => { const item = document.createElement("li"), link = document.createElement("a"); link.href = `/subjects/${subject}/lectures/${lecture.lectureId}`; link.textContent = lecture.title; item.append(link, document.createTextNode(": " + lecture.reason)); list.append(item); });
        notice.append(title, list); main.prepend(notice);
      }
      return data;
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = responseStatus === 401 || responseStatus === 403 ? "سجّل الدخول أو ادخل برابط المتدربين لعرض محتوى هذه المادة." : responseStatus === 404 ? "محتوى هذه المادة غير متاح. عُد إلى المواد الدراسية واختر المادة المطلوبة." : error.message === "platform_required" ? "افتح هذه المادة داخل المنصة للوصول إلى ملخصاتها واختبارها الشامل." : "تعذر تحميل المحتوى المطابق لهذه المادة. أعد المحاولة؛ لا يُعرض محتوى مادة أخرى بدلًا منه.";
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "button subtle"; retry.textContent = "إعادة المحاولة"; retry.addEventListener("click", () => location.reload());
      const link = document.createElement("a"); link.className = "button"; link.textContent = responseStatus === 401 || responseStatus === 403 ? "تسجيل الدخول" : "افتح المنصة";
      link.href = responseStatus === 401 || responseStatus === 403 ? "/login?redirectTo=" + encodeURIComponent(location.pathname + location.search) : "https://web-husen4.vercel.app" + (uuid.test(subject || "") ? (kind === "exam" ? "/exam-module.html" : "/summaries.html") + "?subject=" + subject : "/subjects");
      status.append(document.createElement("br"), retry, document.createTextNode(" "), link);
      return null;
    } finally { clearTimeout(timer); }
  }
  Object.defineProperty(window, "DigitalLeadershipStudy", { value: Object.freeze({ load, validate }), writable: false });
})();

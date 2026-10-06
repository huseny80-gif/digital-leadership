import { feedbackManagementProxy } from "@/lib/api/feedbackManagementProxy";

type Context = { params: Promise<{ feedbackId: string }> };
export async function PATCH(request: Request, context: Context) { return feedbackManagementProxy("PATCH", request, (await context.params).feedbackId); }
export async function DELETE(request: Request, context: Context) { return feedbackManagementProxy("DELETE", request, (await context.params).feedbackId); }

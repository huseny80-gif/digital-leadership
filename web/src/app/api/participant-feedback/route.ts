import { feedbackManagementProxy } from "@/lib/api/feedbackManagementProxy";

export async function GET(request: Request) { return feedbackManagementProxy("GET", request); }

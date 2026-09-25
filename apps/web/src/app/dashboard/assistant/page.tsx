import type { Metadata } from "next";
import { AssistantView } from "@/components/dashboard/assistant-view";

export const metadata: Metadata = {
  title: "Assistant",
  description: "Chat with the Saleslip AI assistant.",
};

export default function AssistantPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AssistantView />
    </div>
  );
}

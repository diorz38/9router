import PortalClient from "./PortalClient";

export const metadata = {
  title: "Client Portal - 9Router",
  description: "View API keys, remaining token quotas, and accessible AI models",
};

export default function PortalPage() {
  return <PortalClient />;
}

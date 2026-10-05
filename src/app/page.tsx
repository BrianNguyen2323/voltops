import { redirect } from "next/navigation";

// SaaS marketing page removed (not a VoltOps goal); the gate in /home routes to setup/login.
export default function Root() {
  redirect("/home");
}

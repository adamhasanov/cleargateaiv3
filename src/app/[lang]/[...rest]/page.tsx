import { notFound } from "next/navigation";

/**
 * Any path under a language that no page handles (e.g. /az/abc) lands here and
 * shows [lang]/not-found.tsx in that language, inside the normal layout.
 */
export default function UnknownPage() {
  notFound();
}

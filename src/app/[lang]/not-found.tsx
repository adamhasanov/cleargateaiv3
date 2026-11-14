import { NotFoundView } from "@/components/NotFoundView";

/** 404 for unknown pages under a valid language, e.g. /ru/anything. Rendered inside the [lang] layout. */
export default function LocaleNotFound() {
  return <NotFoundView />;
}

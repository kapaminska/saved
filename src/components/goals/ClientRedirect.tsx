import { useEffect } from "react";

interface Props {
  url: string;
}

export default function ClientRedirect({ url }: Props) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);

  return null;
}

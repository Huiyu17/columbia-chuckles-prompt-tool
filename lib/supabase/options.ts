// Keep browser, Server Components and proxy on the same compact cookie format.
// User details are fetched through getUser(), not carried in every request header.
export const authCookieEncoding = "tokens-only" as const;

import BrandMark from "@/components/BrandMark";
import LoginButton from "@/components/LoginButton";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="gate"><section className="gate-card stack"><BrandMark /><span className="eyebrow">A little structure. A lot of humor.</span><h1>Good captions start with a good chain.</h1><p className="muted">Build, refine and run prompt chains for Columbia Chuckles. Sign in with your superadmin account to get started.</p>{error && <p role="alert" className="form-error">Sign-in did not complete. Please try again.</p>}<LoginButton /><p className="small muted">Superadmin access is managed by the project owner.</p></section></main>;
}

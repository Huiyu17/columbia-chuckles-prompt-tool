"use client";
/* eslint-disable @next/next/no-img-element -- Render existing authorized photo URLs without a public image optimization proxy. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveChain, deleteChain, generateMedia, findPhotos } from "@/app/actions/chains";
import type { Workspace, Step, Photo } from "@/lib/types";
import { humorStyles, type HumorStyle } from "@/lib/humor";
import { cleanOutputText } from "@/lib/output-text";

export default function ChainWorkspace({ data, selected }: { data: Workspace; selected: string | null }) {
  const router = useRouter();
  const chain = data.chains.find(item => item.id === selected);
  const [query, setQuery] = useState("");
  const [name, setName] = useState(chain?.name ?? "");
  const [description, setDescription] = useState(chain?.description ?? "");
  const withSelectedModels = (values: Step[]) => values.map(step => ({ ...step, llm_model_id: step.llm_model_id ?? data.models[0]?.id ?? null }));
  const [steps, setSteps] = useState<Step[]>(() => withSelectedModels(chain?.steps ?? []));
  const [busy, setBusy] = useState<"save" | "delete" | "run" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState("");
  const [scene, setScene] = useState("");
  const [humor, setHumor] = useState<HumorStyle>("relatable");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const normalized = (values: Step[]) => values.map(step => ({ id: step.id, prompt: step.prompt, llm_model_id: step.llm_model_id }));
  const dirty = name !== (chain?.name ?? "") || description !== (chain?.description ?? "") || JSON.stringify(normalized(steps)) !== JSON.stringify(normalized(chain?.steps ?? []));
  function reset() { setName(chain?.name ?? ""); setDescription(chain?.description ?? ""); setSteps(withSelectedModels(chain?.steps ?? [])); setError(""); setNotice(""); }
  function navigate(id: string | null) {
    if (busy || (dirty && !window.confirm("Discard unsaved changes?"))) return;
    router.push(id ? `/?chain=${id}` : "/");
  }
  function updateStep(id: string, field: "prompt" | "llm_model_id", value: string) {
    setSteps(current => current.map(step => step.id === id ? { ...step, [field]: value || (field === "llm_model_id" ? null : "") } : step));
  }
  function move(index: number, direction: -1 | 1) {
    setSteps(current => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  async function save() {
    setBusy("save"); setError(""); setNotice("");
    try {
      const response = await saveChain(chain?.id ?? null, chain?.revision ?? 0, name, description, steps);
      if (response.error) setError(response.error);
      else { setName(name.trim()); setSteps(steps.map(step => ({ ...step, prompt: step.prompt.trim() }))); setNotice("Prompt chain saved."); if (response.id !== chain?.id) router.push(`/?chain=${response.id}`); router.refresh(); }
    } catch { setError("Save could not be confirmed. Your inputs are still here; reload to check saved changes before retrying."); }
    finally { setBusy(""); }
  }
  async function remove() {
    if (!chain) return;
    setBusy("delete"); setError("");
    try { const response = await deleteChain(chain.id, chain.revision); if (response.error) setError(response.error); else { router.push("/"); router.refresh(); } }
    catch { setError("Deletion could not be confirmed. Reload to check the chain."); }
    finally { setBusy(""); }
  }
  async function run() {
    if (!chain || !photo || dirty) return;
    if (steps.some(step => !data.models.some(model => model.id === step.llm_model_id))) {
      setError("Choose an available model for each step and save before generating.");
      return;
    }
    setBusy("run"); setError(""); setNotice(""); setResult("");
    try {
      const response = await generateMedia(chain.id, chain.revision, photo.id, scene, humor);
      if (response.error) setError(response.error);
      else { setResult(response.output ?? ""); setNotice("Run completed. Output saved to Generated media."); }
    } catch { setError("The connection was interrupted. Check Generated media before starting another run."); }
    finally { setBusy(""); router.refresh(); }
  }
  const filtered = data.chains.filter(item => `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="stack-lg"><div className="page-title"><div><span className="eyebrow">The writing room</span><h1>Prompt chains</h1><p className="muted">Build the steps. Connect the ideas. Find the funny.</p></div><button className="button-primary" disabled={!!busy} onClick={() => navigate(null)}>+ New prompt chain</button></div>
    <div className="workspace"><aside className="chain-list card"><label className="search-label">Your prompt chains<input type="search" placeholder="Search by name…" value={query} onChange={event => setQuery(event.target.value)} /></label><p className="small muted">{data.chains.length} prompt chains</p><div className="chain-links">{filtered.map(item => <button key={item.id} disabled={!!busy} className={`chain-choice ${chain?.id === item.id ? "selected" : ""}`} onClick={() => navigate(item.id)}><strong>{item.name}</strong><span className="small muted">{item.steps.length} {item.steps.length === 1 ? "step" : "steps"}{item.live ? " · In public mix" : ""}</span></button>)}{!filtered.length && <p className="muted small">No prompt chains found.</p>}</div></aside>
      <div className="stack-lg editor-column">{selected && !chain ? <section className="card"><h2>This prompt chain is unavailable.</h2><button onClick={() => navigate(null)}>Create a prompt chain</button></section> : <>
        <section className="card stack"><div className="row spread"><span className="eyebrow">{chain ? "Prompt chain" : "New prompt chain"}</span><span className={`badge ${dirty ? "unsaved" : ""}`}>{dirty ? "Unsaved changes" : chain ? "Saved" : "Draft"}</span></div>
          <fieldset disabled={!!busy} className="stack"><label>Name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="e.g. Campus inner monologue" required /></label><label>Description <span className="muted small">(optional)</span><textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} placeholder="What should this prompt chain create?" /></label>
            <div className="row spread"><h2>Prompt chain steps</h2><span className="small muted">{steps.length} / 6</span></div><p className="small muted">Step 1 receives the photo and scene. Each following step receives the previous step&apos;s output.</p>
            {chain?.live && <p className="callout">In the public mix. Saved changes apply to new public generations; runs already in progress keep their saved configuration.</p>}
            <ol className="steps">{steps.map((step, index) => <li key={step.id} className="step-card stack"><div className="row spread"><div className="row"><span className="step-number">{index + 1}</span><strong>Prompt chain step</strong></div><div className="row step-controls"><button type="button" className="button-ghost" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="button-ghost" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="button-ghost danger" aria-label={`Delete step ${index + 1}`} onClick={() => setSteps(current => current.filter(item => item.id !== step.id))}>Delete</button></div></div>
              <label>Model<select value={step.llm_model_id ?? ""} required onChange={event => updateStep(step.id, "llm_model_id", event.target.value)}>{!step.llm_model_id && <option value="" disabled>{data.models.length ? "Choose a model" : "No models available"}</option>}{data.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}{step.llm_model_id && !data.models.some(model => model.id === step.llm_model_id) && <option value={step.llm_model_id} disabled>Unavailable model — choose another</option>}</select></label>
              <label>Instruction<textarea rows={4} value={step.prompt} onChange={event => updateStep(step.id, "prompt", event.target.value)} maxLength={10000} required placeholder={index === 0 ? "Describe the image, focusing on specific visual details." : "Use the previous output to write something funny."} /></label><span className="small muted">Input: {index === 0 ? "Selected photo, photo description and scene" : `Output from step ${index}`}</span>
            </li>)}</ol>
            {!steps.length && <div className="empty compact"><h3>Start with the first instruction.</h3><p className="muted">Add a step to tell the model what to do with the photo.</p></div>}
            <button type="button" className="add-step" disabled={steps.length >= 6 || !data.models.length} onClick={() => setSteps(current => [...current, { id: crypto.randomUUID(), prompt: "", llm_model_id: data.models[0].id, step_order: current.length }])}>+ Add prompt chain step</button>
            <div className="row"><button className="button-primary" disabled={!dirty || !name.trim() || !steps.length || steps.some(step => !step.prompt.trim() || !data.models.some(model => model.id === step.llm_model_id))} onClick={save}>{busy === "save" ? "Saving…" : chain ? "Save changes" : "Create prompt chain"}</button><button className="button-ghost" disabled={!dirty} onClick={reset}>Discard changes</button></div>
          </fieldset>
          {chain && <div className="delete-area">{confirmDelete ? <div className="stack"><p>Delete this prompt chain and its steps? Its runs will be hidden from Generated media. Execution history will remain available in Admin.</p><div className="row"><button disabled={!!busy} className="button-danger" onClick={remove}>{busy === "delete" ? "Deleting…" : "Confirm deletion"}</button><button disabled={!!busy} className="button-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></div></div> : <button disabled={!!busy} className="button-ghost danger" onClick={() => setConfirmDelete(true)}>Delete prompt chain</button>}</div>}
        </section>
        {error && <p className="form-error card" role="alert">{error}</p>}{notice && <p role="status" className="success">{notice}</p>}
        <section className="card stack"><div className="row spread"><div><span className="eyebrow">See it in action</span><h2>Generate media</h2></div>{chain && <Link className="text-link" href={`/?view=media&chain=${chain.id}`}>View generated media →</Link>}</div>
          <p className="small muted">Runs all saved steps in order and saves the final text. Output stays in this tool until you choose how to use it.</p>
          {!chain ? <p className="muted">Create your prompt chain to start generating.</p> : <fieldset disabled={!!busy} className="stack">
            <PhotoPicker selected={photo} onSelect={setPhoto} />
            <label>Scene<textarea rows={2} value={scene} onChange={event => setScene(event.target.value)} maxLength={800} placeholder="e.g. Waiting outside Butler the night before finals" /></label>
            <label>Choose the humor<select value={humor} onChange={event => setHumor(event.target.value as HumorStyle)}>{humorStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
            {dirty && <p className="callout">Save your changes before generating.</p>}<div className="row"><button className="button-primary" disabled={dirty || !steps.length || !photo || !scene.trim()} onClick={run}>{busy === "run" ? `Running ${steps.length} ${steps.length === 1 ? "step" : "steps"}…` : "Generate media"}</button>{busy === "run" && <span role="status" className="small muted">Each model call can take up to 30 seconds. Step results are saved as they finish.</span>}</div></fieldset>}
          {result && <div className="output-panel"><span className="eyebrow">Final output</span><p className="generated-text">{cleanOutputText(result)}</p></div>}
        </section>
      </>}</div>
    </div></div>;
}

function PhotoPicker({ selected, onSelect }: { selected: Photo | null; onSelect: (photo: Photo) => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);
  useEffect(() => {
    let active = true;
    const ticket = ++latest.current;
    void findPhotos("", 1).then(response => {
      if (!active || ticket !== latest.current) return;
      if (response.error) setError(response.error);
      else { setRows(response.rows ?? []); setTotal(response.total ?? 0); setSearched(true); }
    }).catch(() => {
      if (active && ticket === latest.current) setError("Could not load photos. Try again.");
    }).finally(() => { if (active && ticket === latest.current) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function search(p: number) {
    const ticket = ++latest.current; setBusy(true); setError("");
    try { const response = await findPhotos(query, p); if (ticket !== latest.current) return;
      if (response.error) setError(response.error); else { setRows(response.rows ?? []); setTotal(response.total ?? 0); setPage(p); setSearched(true); } }
    catch { if (ticket === latest.current) setError("Could not load photos. Try again."); }
    finally { if (ticket === latest.current) setBusy(false); }
  }
  return <div className="stack photo-picker" aria-busy={busy}><div><h3>Choose a photo</h3><p className="small muted">Click a photo to use it as the input for this run.</p></div><details className="photo-search"><summary>Search photos</summary><div className="row"><input aria-label="Search photos by description" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter by description…" onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(1); } }} /><button type="button" disabled={busy} onClick={() => search(1)}>Search</button></div></details>{busy && <p role="status" className="small muted">Loading photos…</p>}{error && <div role="alert" className="row"><p className="form-error">{error}</p><button type="button" disabled={busy} onClick={() => search(1)}>Try again</button></div>}
    {selected && <div className="selected-photo row"><img src={selected.url} alt={selected.alt_text || "Selected photo"} /><span className="small">{selected.alt_text || "Selected photo"}<small className="muted">{selected.storage_path ? "Photo will be sent to step 1" : "Step 1 will use the photo description"}</small></span></div>}
    {!!rows.length && <><div className="photo-options">{rows.map(photo => <button type="button" key={photo.id} className={`photo-option ${selected?.id === photo.id ? "selected" : ""}`} aria-pressed={selected?.id === photo.id} onClick={() => onSelect(photo)}><img src={photo.url} alt="" loading="lazy" />{selected?.id === photo.id && <span className="photo-check" aria-hidden="true">✓</span>}<span>{photo.alt_text || "Untitled photo"}</span></button>)}</div>{total > 25 && <div className="row"><button type="button" disabled={busy || page <= 1} onClick={() => search(page - 1)}>Previous</button><span className="small muted">Page {page} · {total} photos</span><button type="button" disabled={busy || page * 25 >= total} onClick={() => search(page + 1)}>Next</button></div>}</>}
    {!busy && searched && total === 0 && <p className="muted">No photos found.</p>}
  </div>;
}

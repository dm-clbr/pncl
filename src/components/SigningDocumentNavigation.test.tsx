import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SigningDocumentReview from "./SigningDocumentReview";

vi.mock("@/lib/pdfjs-setup", () => ({}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  version: "4.10.38",
  getDocument: () => ({ destroy: vi.fn(), promise: Promise.resolve({
    numPages: 3,
    getPage: async (page: number) => ({
      getViewport: () => ({ width: 600, height: 800, convertToViewportRectangle: (rect: number[]) => rect }),
      getAnnotations: async () => (page === 3 ? [
        { fieldName: "pncl_signature_1", alternativeText: "Signature", readOnly: true },
        { fieldName: "pncl_text_2", alternativeText: "First and last name" },
        { fieldName: "pncl_text_3", alternativeText: "Personal email" },
      ] : page === 2 ? [{ fieldName: "pncl_text_office", alternativeText: "Office" }] : [])
        .map(field => ({ ...field, fieldType: "Tx", required: true, rect: [60, 100, 300, 130] })),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    }),
  }) }),
}));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("jumps to placed fields, synchronizes both pagers, and still requires skipped pages", async () => {
  const openSignature = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Record<string, string | boolean>>({});
    const [ready, setReady] = useState(false);
    return <><SigningDocumentReview url="/sample.pdf" title="Agreement" values={values} onValuesChange={setValues} onReviewed={setReady} onSignatureClick={openSignature} /><button disabled={!ready}>Submit</button></>;
  }
  render(<Harness />);
  const jump = await screen.findByRole("button", { name: "Jump to signature" });
  await waitFor(() => expect(jump).toBeEnabled());
  fireEvent.click(jump);
  const signature = await screen.findByRole("button", { name: "Create signature: Signature" });
  await waitFor(() => expect(signature).toHaveFocus());
  for (const position of ["top", "bottom"]) {
    const pager = screen.getByRole("navigation", { name: `Document pages (${position})` });
    expect(within(pager).getByText("Page 3 of 3")).toBeInTheDocument();
    expect(within(pager).getByRole("button", { name: /Next page/ })).toBeDisabled();
  }
  expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  fireEvent.click(signature);
  expect(openSignature).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Next required field" }));
  const office = await screen.findByRole("textbox", { name: "Office" });
  await waitFor(() => expect(office).toHaveFocus());
  expect(screen.getAllByText("Page 2 of 3")).toHaveLength(2);
  fireEvent.change(office, { target: { value: "Denver" } });
  fireEvent.click(screen.getByRole("button", { name: "Next page (top)" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "First and last name" }), { target: { value: "Alex Morgan" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Personal email" }), { target: { value: "alex@example.com" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(await screen.findByRole("textbox", { name: "Office" })).toHaveValue("Denver");
  expect(screen.getAllByText("Page 2 of 3")).toHaveLength(2);
});

it("keeps the signature editor identity and placed PDF fields in sync", async () => {
  function Harness() {
    const [values, setValues] = useState<Record<string, string | boolean>>({});
    const [name, setName] = useState("Alex Morgan");
    const [email, setEmail] = useState("alex@example.com");
    return <><SigningDocumentReview url="/sample.pdf" title="Agreement" values={values} onValuesChange={setValues} onReviewed={() => undefined} onSignatureClick={() => undefined} signer={{ name, email, onNameChange: setName, onEmailChange: setEmail }} />
      <output aria-label="Signer">{name} / {email}</output><output aria-label="Submitted fields">{JSON.stringify(values)}</output>
      <button onClick={() => { setName("Sam Agent"); setEmail("sam@example.com"); }}>Update in signature editor</button></>;
  }
  render(<Harness />);
  const jump = await screen.findByRole("button", { name: "Jump to signature" });
  await waitFor(() => expect(jump).toBeEnabled());
  fireEvent.click(jump);
  expect(await screen.findByRole("textbox", { name: "First and last name" })).toHaveValue("Alex Morgan");
  expect(screen.getByRole("textbox", { name: "Personal email" })).toHaveValue("alex@example.com");
  fireEvent.change(screen.getByRole("textbox", { name: "First and last name" }), { target: { value: "Casey Agent" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Personal email" }), { target: { value: "casey@example.com" } });
  expect(screen.getByLabelText("Signer")).toHaveTextContent("Casey Agent / casey@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Update in signature editor" }));
  expect(screen.getByRole("textbox", { name: "First and last name" })).toHaveValue("Sam Agent");
  expect(screen.getByRole("textbox", { name: "Personal email" })).toHaveValue("sam@example.com");
  await waitFor(() => expect(JSON.parse(screen.getByLabelText("Submitted fields").textContent!)).toMatchObject({ pncl_text_2: "Sam Agent", pncl_text_3: "sam@example.com" }));
});

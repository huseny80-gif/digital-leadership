import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

const tags = new Set("p div span h1 h2 h3 h4 h5 h6 b strong i em u s blockquote pre code ul ol li dl dt dd table thead tbody tfoot tr th td caption details summary br hr a img".split(" "));
const discard = new Set("script style iframe object embed form input button select textarea template svg math noscript base link meta".split(" "));
type Node = DefaultTreeAdapterMap["childNode"];
function safeUrl(value: string): boolean {
  if (/[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  if (/^(?:#|\/(?!\/))/u.test(value)) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}

/** Parse with the browser's HTML rules, then serialize a small allow-list.
 * User text stays text; executable elements, event attributes and unsafe
 * URLs cannot become part of the reader's document. */
export function safeStudyHtml(html: string): string {
  const root = parseFragment(html);
  const clean = (nodes: Node[]): Node[] => nodes.flatMap(node => {
    if (node.nodeName === "#text") return [node];
    if (!("tagName" in node)) return [];
    if (discard.has(node.tagName)) return [];
    node.childNodes = clean(node.childNodes);
    if (!tags.has(node.tagName)) return node.childNodes;
    node.attrs = node.attrs.filter(attribute => {
      if (attribute.namespace) return false;
      const { name, value } = attribute;
      if (name === "title" || name === "alt") return true;
      if (["class", "id"].includes(name)) return /^[\p{L}\p{N}_ .:-]{1,160}$/u.test(value);
      if (name === "dir") return ["rtl", "ltr", "auto"].includes(value);
      if (name === "lang") return /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu.test(value);
      if (node.tagName === "a" && name === "href") return safeUrl(value);
      if (node.tagName === "img" && name === "src") return safeUrl(value);
      if (["td", "th"].includes(node.tagName) && ["colspan", "rowspan"].includes(name)) return /^[1-9]\d?$/u.test(value);
      if (node.tagName === "details" && name === "open") return true;
      return false;
    });
    if (node.tagName === "a") node.attrs.push({ name: "rel", value: "noopener noreferrer" });
    return [node];
  });
  root.childNodes = clean(root.childNodes);
  return serialize(root);
}

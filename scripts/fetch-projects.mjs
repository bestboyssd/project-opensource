import { mkdir, readFile, writeFile } from "node:fs/promises";

const configSource = await readFile(new URL("../config.js", import.meta.url), "utf8");
const usernameMatch = configSource.match(/githubUsername:\s*["']([^"']+)["']/);
const username = usernameMatch?.[1]?.trim();
if (!username) throw new Error("Could not read githubUsername from config.js.");

const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is required to publish the repository snapshot.");

const endpoint = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/repos`);
endpoint.search = new URLSearchParams({ per_page: "100", sort: "updated", type: "owner" }).toString();
const response = await fetch(endpoint, {
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "ProjectOpensourceSite/1.0",
    "X-GitHub-Api-Version": "2022-11-28"
  }
});
if (!response.ok) throw new Error(`GitHub repository snapshot failed (${response.status}).`);

const repos = await response.json();
if (!Array.isArray(repos)) throw new Error("GitHub returned an unexpected repository list.");

const fields = [
  "full_name", "name", "html_url", "description", "language", "stargazers_count",
  "archived", "fork", "private", "updated_at", "default_branch", "topics", "homepage"
];
const snapshot = repos.map(repo => Object.fromEntries(fields.map(field => [field, repo[field] ?? null])));
await mkdir(new URL("../_site/", import.meta.url), { recursive: true });
await writeFile(new URL("../_site/repos.json", import.meta.url), `${JSON.stringify(snapshot)}\n`, "utf8");
process.stdout.write(`Prepared ${snapshot.length} repositories for ${username}.\n`);

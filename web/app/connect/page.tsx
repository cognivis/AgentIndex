import type { Metadata } from 'next';
import { CopyButton } from '../../components/copy-button';
import { McpConsole } from '../../components/mcp-console';
import styles from './connect.module.css';

export const metadata: Metadata = {
  title: 'Connect — AgentIndex',
  description:
    'Plug the AgentIndex trust index into your agent via MCP or the x402 API, or list your own service.',
};

export const dynamic = 'force-dynamic';

const REGISTRAR =
  'https://sepolia.etherscan.io/address/0xdeB458892c7702Fe0112161EEa28C0F46eFd6379';
const REPO = 'https://github.com/cognivis/AgentIndex';
const REMOTE_MCP_URL = process.env.PUBLIC_MCP_URL
  ? `${process.env.PUBLIC_MCP_URL.replace(/\/$/, '')}/mcp`
  : process.env.NEXT_PUBLIC_MCP_URL ?? 'https://<your-mcp-host>/mcp';
const MCP_INSTALL = `npx add-mcp ${REMOTE_MCP_URL}`;

const MCP_CONFIG = `{
  "mcpServers": {
    "agentindex": {
      "command": "mcp/node_modules/.bin/tsx",
      "args": ["mcp/src/index.ts"]
    }
  }
}`;

const MCP_PROMPT =
  'Ask agentindex to resolve: I need current weather for a city — which service should I pay, and what should I avoid?';

const CURL = `curl -X POST https://<your-host>/resolve \\
  -H 'content-type: application/json' \\
  -d '{"task":"get current weather for singapore"}'
# → 402 Payment Required, then settle via x402 and retry → ranked services + who to avoid`;

export default function ConnectPage() {
  return (
    <main className={`wrap ${styles.page}`}>
      <div className={styles.head}>
        <h1 className={styles.title}>Connect</h1>
        <p className={styles.lede}>
          AgentIndex is a trust index for x402 AI-agent services — it tells your
          agent which paid services are honest and which are scams, with proof
          on-chain. Plug it into your agent two ways, or list a service of your
          own.
        </p>
      </div>

      {/* 1. MCP */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.step}>01 · Read the index</span>
          <h2 className={styles.sectionTitle}>Use it in Claude / Cursor (MCP)</h2>
        </div>
        <div className={styles.body}>
          <p>
            AgentIndex ships a Model Context Protocol server exposing four
            tools. Any MCP client — Claude Code, Claude Desktop, Cursor — can
            call them. They read the on-chain trust index (subgraph + ENS) and
            need no payment.
          </p>
          <ul className={styles.tools}>
            <li>find_service</li>
            <li>check_trust</li>
            <li>resolve_data_need</li>
            <li>get_verified_data</li>
          </ul>

          <p className={styles.blockLabel}>Connect to the hosted Streamable HTTP server:</p>
          <div className={styles.codeBlock}>
            <CopyButton text={MCP_INSTALL} label="Copy install command" />
            <pre>
              <code>{MCP_INSTALL}</code>
            </pre>
          </div>

          <p className={styles.blockLabel}>Or run it locally over stdio in <code>.mcp.json</code>:</p>
          <div className={styles.codeBlock}>
            <CopyButton text={MCP_CONFIG} label="Copy MCP config" />
            <pre>
              <code>{MCP_CONFIG}</code>
            </pre>
          </div>

          <p className={styles.blockLabel}>Then just ask:</p>
          <div className={`${styles.codeBlock} ${styles.prompt}`}>
            <CopyButton text={MCP_PROMPT} label="Copy example prompt" />
            <pre>
              <code>{MCP_PROMPT}</code>
            </pre>
          </div>

          <p className={styles.blockLabel}>Or try the index tools right here:</p>
          <McpConsole />
        </div>
      </section>

      {/* 2. API */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.step}>02 · Or call the API</span>
          <h2 className={styles.sectionTitle}>Call the API</h2>
        </div>
        <div className={styles.body}>
          <p>
            For non-MCP agents, the same ranking is available as an x402-gated
            REST endpoint. The agent pays <code>$0.01</code> per query in HBAR on
            Hedera — the standard flow of HTTP 402 → pay → 200.
          </p>
          <div className={styles.codeBlock}>
            <CopyButton text={CURL} label="Copy curl command" />
            <pre>
              <code>{CURL}</code>
            </pre>
          </div>
          <p>
            It returns the same <code>payThis</code> / <code>avoid</code> /{' '}
            <code>_meta</code> (freshness) shape as the MCP tools.
          </p>
        </div>
      </section>

      {/* 3. List */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.step}>03 · Get listed</span>
          <h2 className={styles.sectionTitle}>List your service</h2>
        </div>
        <div className={styles.body}>
          <p>
            A service lists itself by registering an ENS subname of{' '}
            <code>agentindex.eth</code> through our ServiceRegistrar, publishing
            its endpoint, price and spec as ENS text records.
          </p>
          <p>
            Listing charges a fee via <code>ServiceRegistrar.setPricing()</code>{' '}
            paid to the registry beneficiary —{' '}
            <span className={styles.free}>free during the hackathon</span> (price
            set to 0).
          </p>
          <p>
            Names are <strong>revocable</strong>: a service caught taking payment
            and returning junk gets delisted on-chain and drops out of the index.
          </p>
          <p>
            <a
              className={styles.link}
              href={REGISTRAR}
              target="_blank"
              rel="noreferrer"
            >
              view the registrar ↗
            </a>
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        Repo at{' '}
        <a
          className={styles.link}
          href={REPO}
          target="_blank"
          rel="noreferrer"
        >
          github.com/cognivis/AgentIndex
        </a>
        .
      </footer>
    </main>
  );
}

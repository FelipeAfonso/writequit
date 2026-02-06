<script lang="ts">
	let typedLines = $state<string[]>([]);
	let currentLine = $state(0);
	let currentChar = $state(0);
	let showCursor = $state(true);
	let bootComplete = $state(false);
	let showContent = $state(false);

	const bootSequence = [
		'$ writequit --init',
		'loading modules.......... OK',
		'scanning /dev/productivity.. 0 BS',
		'mounting task-engine v3.1.4. OK',
		'binding :wq to everything.. OK',
		'',
		'  ██╗    ██╗ ██████╗ ',
		'  ██║    ██║██╔═══██╗',
		'  ██║ █╗ ██║██║   ██║',
		'  ██║███╗██║██║▄▄ ██║',
		'  ╚███╔███╔╝╚██████╔╝',
		'   ╚══╝╚══╝  ╚══▀▀═╝ ',
		'',
		'  write. quit. ship.',
		'> ready_'
	];

	// Phase 1: 1s — type first line (19 ticks @ 53ms)
	// Phase 2: 0.5s — hold with cursor blinking
	// Phase 3: 1s — type remaining lines (290 ticks @ 3.4ms)
	// Phase 4: 1.5s — hold final state, then fade to content

	let phase = $state<'typing1' | 'pause' | 'typing2' | 'hold' | 'done'>(
		'typing1'
	);

	function advanceTick() {
		if (currentLine < bootSequence.length) {
			const line = bootSequence[currentLine];
			if (currentChar < line.length) {
				if (!typedLines[currentLine]) {
					typedLines[currentLine] = '';
				}
				typedLines[currentLine] += line[currentChar];
				currentChar++;
				typedLines = [...typedLines];
			} else {
				currentLine++;
				currentChar = 0;
				typedLines = [...typedLines, ''];
			}
		}
	}

	$effect(() => {
		let timer: ReturnType<typeof setInterval> | undefined;

		if (phase === 'typing1') {
			// Type first line at 53ms per tick
			timer = setInterval(() => {
				advanceTick();
				// After finishing line 0 (currentLine advances to 1)
				if (currentLine >= 1) {
					clearInterval(timer);
					phase = 'pause';
				}
			}, 53);
		} else if (phase === 'pause') {
			// Hold for 500ms
			const t = setTimeout(() => {
				phase = 'typing2';
			}, 500);
			return () => clearTimeout(t);
		} else if (phase === 'typing2') {
			// Type remaining lines at 3.4ms per tick
			timer = setInterval(() => {
				if (currentLine < bootSequence.length) {
					advanceTick();
				} else {
					clearInterval(timer);
					bootComplete = true;
					phase = 'hold';
				}
			}, 3.4);
		} else if (phase === 'hold') {
			// Hold final state for 1.5s
			const t = setTimeout(() => {
				showContent = true;
				phase = 'done';
			}, 1500);
			return () => clearTimeout(t);
		}

		return () => {
			if (timer) clearInterval(timer);
		};
	});

	$effect(() => {
		const cursorBlink = setInterval(() => {
			showCursor = !showCursor;
		}, 530);

		return () => clearInterval(cursorBlink);
	});
</script>

<svelte:head>
	<title>:wq - write. quit. ship.</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="preconnect"
		href="https://fonts.gstatic.com"
		crossorigin="anonymous"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page">
	<!-- Scanline overlay -->
	<div class="scanlines"></div>

	<!-- Boot sequence -->
	<div class="terminal" class:fade-out={showContent}>
		<pre class="boot-text">{#each typedLines as line, idx (idx)}{line}
			{/each}{#if !bootComplete}<span
					class="cursor"
					class:blink={showCursor}>█</span>{/if}</pre>
	</div>

	<!-- Main content -->
	{#if showContent}
		<div class="content" class:visible={showContent}>
			<!-- Header bar -->
			<header class="header">
				<div class="header-left">
					<span class="prompt">$</span>
					<span class="brand">:wq</span>
				</div>
				<div class="header-right">
					<span class="header-tag">v3.1.4</span>
					<span class="header-sep">|</span>
					<span class="header-tag">MIT</span>
					<span class="header-sep">|</span>
					<a href="/login" class="header-cta">:login</a>
				</div>
			</header>

			<!-- Hero -->
			<section class="hero">
				<div class="hero-label">
					<span class="label-dot"></span>
					task management for developers who ship
				</div>
				<div class="hero-name">
					<span class="hero-name-wq">:WriteQuit</span>
				</div>
				<h1 class="hero-title">
					<span class="hero-line">Stop context</span>
					<span class="hero-line">switching.</span>
					<span class="hero-line accent">Start shipping.</span>
				</h1>
				<p class="hero-sub">
					Tasks, time tracking, and invoices in a single keyboard-driven
					interface. No dashboards. No drag-and-drop. No BS. Just <code>
						:wq
					</code>
					and move on.
				</p>
				<div class="hero-actions">
					<a href="/login" class="btn-primary">
						<span class="btn-prompt">&gt;</span>
						get started
					</a>
					<span class="hero-hint">
						free during beta &middot; no credit card
					</span>
				</div>
			</section>

			<!-- Feature grid -->
			<section class="features">
				<div class="feature-grid">
					<div class="feature-card">
						<div class="feature-icon">[&gt;]</div>
						<h3 class="feature-title">Vim-native workflow</h3>
						<p class="feature-desc">
							<code>j/k</code>
							to navigate.
							<code>:</code>
							for commands.
							<code>:wq</code>
							when you're done. Your muscle memory works here.
						</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">[~]</div>
						<h3 class="feature-title">Time tracking</h3>
						<p class="feature-desc">
							Start a session with <code>:track</code>
							. Stop with
							<code>:stop</code>
							. See exactly where your hours went. Bill accurately.
						</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">[$]</div>
						<h3 class="feature-title">Invoice generation</h3>
						<p class="feature-desc">
							Select sessions, set your rate, hit <code>:invoice</code>
							. PDF lands in your downloads. Client gets paid notice. Done.
						</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">[+]</div>
						<h3 class="feature-title">Tag everything</h3>
						<p class="feature-desc">
							Inline tags right in your task text: <code>+frontend</code>
							<code>+urgent</code>
							<code>+client-name</code>
							. Filter instantly. No category dropdowns.
						</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">[*]</div>
						<h3 class="feature-title">Markdown tasks</h3>
						<p class="feature-desc">
							Write tasks in full markdown. Code blocks with syntax
							highlighting. No rich text editors, just text that renders.
						</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">[%]</div>
						<h3 class="feature-title">Reports that matter</h3>
						<p class="feature-desc">
							Weekly/monthly breakdowns by project, tag, or client. Export to
							PDF. Know where your time actually goes.
						</p>
					</div>
				</div>
			</section>

			<!-- Terminal demo -->
			<section class="demo">
				<div class="demo-window">
					<div class="demo-titlebar">
						<span class="demo-dot red"></span>
						<span class="demo-dot yellow"></span>
						<span class="demo-dot green"></span>
						<span class="demo-titlebar-text">:wq - tasks</span>
					</div>
					<div class="demo-body">
						<div class="demo-line">
							<span class="line-status done">[x]</span>
							<span class="line-text">Set up CI/CD pipeline #devops</span>
							<span class="line-time">2h 14m</span>
						</div>
						<div class="demo-line">
							<span class="line-status done">[x]</span>
							<span class="line-text">Fix auth token refresh bug #backend</span>
							<span class="line-time">0h 47m</span>
						</div>
						<div class="demo-line active">
							<span class="line-status active-status">[*]</span>
							<span class="line-text">Build landing page #frontend @acme</span>
							<span class="line-time blink-slow">1h 23m</span>
						</div>
						<div class="demo-line">
							<span class="line-status inbox">[ ]</span>
							<span class="line-text">Write API documentation #docs</span>
							<span class="line-time">--:--</span>
						</div>
						<div class="demo-line">
							<span class="line-status inbox">[ ]</span>
							<span class="line-text">Invoice Acme Corp - December @acme</span>
							<span class="line-time">--:--</span>
						</div>
						<div class="demo-command">
							<span class="cmd-prompt">:</span>
							<span class="cmd-text">
								wq
								<span class="cursor-inline" class:blink={showCursor}>█</span>
							</span>
						</div>
					</div>
				</div>
			</section>

			<!-- CTA -->
			<section class="cta">
				<div class="cta-inner">
					<p class="cta-text">
						<span class="cta-prompt">&gt;</span>
						Ready to stop wasting time on tools that waste your time?
					</p>
					<a href="/login" class="btn-primary large">
						<span class="btn-prompt">&gt;</span>
						start shipping
					</a>
				</div>
			</section>

			<!-- Footer -->
			<footer class="footer">
				<span class="footer-brand">:wq</span>
				<span class="footer-sep">&middot;</span>
				<span class="footer-text">write. quit. ship.</span>
				<span class="footer-sep">&middot;</span>
				<span class="footer-text">built for developers who don't like BS</span>
			</footer>
		</div>
	{/if}
</div>

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes scanline {
		0% {
			transform: translateY(-100%);
		}
		100% {
			transform: translateY(100vh);
		}
	}

	@keyframes blinkSlow {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.page {
		min-height: 100vh;
		background: #0a0a0e;
		font-family: 'JetBrains Mono', monospace;
		color: #b4befe;
		position: relative;
		overflow-x: hidden;
	}

	.scanlines {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 100;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			rgba(0, 0, 0, 0.03) 2px,
			rgba(0, 0, 0, 0.03) 4px
		);
	}

	.scanlines::after {
		content: '';
		position: absolute;
		top: -100%;
		left: 0;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			transparent 50%,
			rgba(100, 140, 255, 0.015) 50%
		);
		animation: scanline 8s linear infinite;
	}

	/* Boot terminal */
	.terminal {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		z-index: 50;
		background: #0a0a0e;
		transition: opacity 0.6s ease;
	}

	.terminal.fade-out {
		opacity: 0;
		pointer-events: none;
	}

	.boot-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		line-height: 1.6;
		color: #6e7a96;
		white-space: pre;
		max-width: 40ch;
	}

	.cursor {
		color: #7aa2f7;
		opacity: 0;
		transition: opacity 0.05s;
	}

	.cursor.blink {
		opacity: 1;
	}

	/* Main content */
	.content {
		opacity: 0;
		transition: opacity 0.8s ease;
		padding-bottom: 5rem;
	}

	.content.visible {
		opacity: 1;
	}

	/* Header */
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 2rem;
		border-bottom: 1px solid rgba(122, 162, 247, 0.1);
		animation: fadeIn 0.6s ease both;
		animation-delay: 0.1s;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.prompt {
		color: #6e7a96;
		font-size: 0.7rem;
	}

	.brand {
		font-size: 1rem;
		font-weight: 700;
		color: #7aa2f7;
		letter-spacing: -0.02em;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.55rem;
	}

	.header-tag {
		color: #6e7a96;
	}

	.header-sep {
		color: rgba(122, 162, 247, 0.2);
	}

	.header-cta {
		color: #7aa2f7;
		text-decoration: none;
		padding: 0.2rem 0.6rem;
		border: 1px solid rgba(122, 162, 247, 0.3);
		transition: all 0.15s;
	}

	.header-cta:hover {
		background: rgba(122, 162, 247, 0.1);
		border-color: #7aa2f7;
	}

	/* Hero */
	.hero {
		padding: 5rem 2rem 4rem;
		max-width: 52rem;
		margin: 0 auto;
		animation: fadeIn 0.6s ease both;
		animation-delay: 0.3s;
	}

	.hero-label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: #6e7a96;
		margin-bottom: 1.5rem;
	}

	.label-dot {
		width: 6px;
		height: 6px;
		background: #9ece6a;
		border-radius: 50%;
		animation: blinkSlow 2s ease infinite;
	}

	.hero-name {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.hero-name-wq {
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		font-weight: 700;
		color: #7aa2f7;
		letter-spacing: -0.03em;
	}

	.hero-name-full {
		font-size: clamp(0.55rem, 1.2vw, 0.7rem);
		font-weight: 400;
		color: #565f89;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		position: relative;
		top: -0.05em;
	}

	.hero-title {
		font-size: clamp(2rem, 6vw, 3.5rem);
		font-weight: 700;
		line-height: 1.1;
		margin: 0 0 1.5rem;
		letter-spacing: -0.03em;
	}

	.hero-line {
		display: block;
		color: #cdd6f4;
	}

	.hero-line.accent {
		color: #7aa2f7;
	}

	.hero-sub {
		font-size: 0.75rem;
		line-height: 1.8;
		color: #6e7a96;
		max-width: 38rem;
		margin-bottom: 2rem;
	}

	.hero-sub code {
		color: #f7768e;
		background: rgba(247, 118, 142, 0.08);
		padding: 0.1rem 0.3rem;
		font-size: 0.7rem;
	}

	.hero-actions {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1.5rem;
		background: #7aa2f7;
		color: #0a0a0e;
		text-decoration: none;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		border: none;
		transition: all 0.15s;
		cursor: pointer;
	}

	.btn-primary:hover {
		background: #89b4fa;
		transform: translateY(-1px);
		box-shadow: 0 4px 20px rgba(122, 162, 247, 0.3);
	}

	.btn-primary.large {
		padding: 0.8rem 2rem;
		font-size: 0.75rem;
	}

	.btn-prompt {
		opacity: 0.6;
	}

	.hero-hint {
		font-size: 0.5rem;
		color: #565f89;
	}

	/* Features */
	.features {
		padding: 3rem 2rem;
		max-width: 64rem;
		margin: 0 auto;
		animation: fadeIn 0.6s ease both;
		animation-delay: 0.5s;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1px;
		background: rgba(122, 162, 247, 0.08);
		border: 1px solid rgba(122, 162, 247, 0.08);
	}

	.feature-card {
		padding: 1.5rem;
		background: #0a0a0e;
		transition: background 0.2s;
	}

	.feature-card:hover {
		background: #0d0d12;
	}

	.feature-icon {
		font-size: 0.8rem;
		color: #7aa2f7;
		margin-bottom: 0.75rem;
		font-weight: 600;
	}

	.feature-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: #cdd6f4;
		margin: 0 0 0.5rem;
	}

	.feature-desc {
		font-size: 0.55rem;
		line-height: 1.8;
		color: #6e7a96;
		margin: 0;
	}

	.feature-desc code {
		color: #f7768e;
		background: rgba(247, 118, 142, 0.08);
		padding: 0.05rem 0.2rem;
		font-size: 0.5rem;
	}

	/* Demo */
	.demo {
		padding: 3rem 2rem;
		max-width: 48rem;
		margin: 0 auto;
		animation: fadeIn 0.6s ease both;
		animation-delay: 0.7s;
	}

	.demo-window {
		border: 1px solid rgba(122, 162, 247, 0.15);
		background: #0d0d12;
		overflow: hidden;
	}

	.demo-titlebar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		background: rgba(122, 162, 247, 0.04);
		border-bottom: 1px solid rgba(122, 162, 247, 0.08);
	}

	.demo-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.demo-dot.red {
		background: #f7768e;
	}
	.demo-dot.yellow {
		background: #e0af68;
	}
	.demo-dot.green {
		background: #9ece6a;
	}

	.demo-titlebar-text {
		margin-left: 0.5rem;
		font-size: 0.5rem;
		color: #565f89;
	}

	.demo-body {
		padding: 1rem;
	}

	.demo-line {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 0.5rem;
		font-size: 0.6rem;
		border-left: 2px solid transparent;
		transition: background 0.15s;
	}

	.demo-line.active {
		background: rgba(122, 162, 247, 0.06);
		border-left-color: #7aa2f7;
	}

	.line-status {
		font-weight: 600;
		flex-shrink: 0;
	}

	.line-status.done {
		color: #9ece6a;
	}
	.line-status.active-status {
		color: #7aa2f7;
	}
	.line-status.inbox {
		color: #565f89;
	}

	.line-text {
		flex: 1;
		color: #a9b1d6;
	}

	.line-time {
		color: #565f89;
		font-size: 0.5rem;
	}

	.line-time.blink-slow {
		color: #7aa2f7;
		animation: blinkSlow 2s ease infinite;
	}

	.demo-command {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(122, 162, 247, 0.08);
		font-size: 0.6rem;
	}

	.cmd-prompt {
		color: #7aa2f7;
		font-weight: 700;
	}

	.cmd-text {
		color: #cdd6f4;
	}

	.cursor-inline {
		color: #7aa2f7;
		opacity: 0;
		transition: opacity 0.05s;
	}

	.cursor-inline.blink {
		opacity: 1;
	}

	/* CTA */
	.cta {
		padding: 4rem 2rem;
		animation: fadeIn 0.6s ease both;
		animation-delay: 0.9s;
	}

	.cta-inner {
		max-width: 48rem;
		margin: 0 auto;
		text-align: center;
	}

	.cta-text {
		font-size: 0.8rem;
		color: #6e7a96;
		margin-bottom: 1.5rem;
	}

	.cta-prompt {
		color: #7aa2f7;
	}

	/* Footer */
	.footer {
		padding: 1.5rem 2rem;
		border-top: 1px solid rgba(122, 162, 247, 0.06);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		font-size: 0.5rem;
		color: #3b4261;
	}

	.footer-brand {
		color: #565f89;
		font-weight: 600;
	}

	.footer-sep {
		color: rgba(122, 162, 247, 0.15);
	}

	@media (max-width: 640px) {
		.hero {
			padding: 3rem 1.25rem 2.5rem;
		}
		.hero-actions {
			flex-direction: column;
			align-items: flex-start;
		}
		.features,
		.demo,
		.cta {
			padding-left: 1.25rem;
			padding-right: 1.25rem;
		}
	}
</style>

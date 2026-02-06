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
		'scanning /dev/productivity.. OK',
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

<div
	class="relative min-h-screen overflow-x-hidden font-[JetBrains_Mono,monospace] text-[#b4befe]"
	style="background: #0a0a0e;"
>
	<!-- Grid background -->
	<div class="grid-bg"></div>
	<div class="grid-spotlight"></div>

	<!-- Scanline overlay -->
	<div class="scanlines"></div>

	<!-- Boot sequence -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-8 transition-opacity duration-600 ease-in-out"
		class:opacity-0={showContent}
		class:pointer-events-none={showContent}
		style="background: #0a0a0e;"
	>
		<pre
			class="font-[JetBrains_Mono,monospace] text-[0.7rem] leading-relaxed whitespace-pre text-[#6e7a96]"
			style="max-width: 40ch;">{#each typedLines as line, idx (idx)}{line}
			{/each}{#if !bootComplete}<span
					class="cursor text-primary"
					class:blink={showCursor}>█</span>{/if}</pre>
	</div>

	<!-- Main content -->
	{#if showContent}
		<div
			class="pb-20 transition-opacity duration-800 ease-in-out"
			class:opacity-0={!showContent}
			class:opacity-100={showContent}
		>
			<!-- Header bar -->
			<header
				class="animate-fade-in flex items-center justify-between border-b border-primary/10 px-8 py-4"
				style="animation-delay: 0.1s;"
			>
				<div class="flex items-center gap-2">
					<span class="text-base font-bold -tracking-wide text-primary">
						:wq
					</span>
				</div>
				<div class="flex items-center gap-2 text-[0.55rem]">
					<a
						href="/login"
						class="border border-primary/30 px-2.5 py-1 text-primary no-underline transition-all duration-150 hover:border-primary hover:bg-primary/10"
					>
						:login
					</a>
				</div>
			</header>

			<!-- Hero -->
			<section
				class="animate-fade-in relative mx-auto max-w-[52rem] px-8 pt-20 pb-16"
				style="animation-delay: 0.3s;"
			>
				<div class="hero-glow"></div>
				<div
					class="mb-6 inline-flex items-center gap-2 text-[0.55rem] tracking-[0.2em] text-[#6e7a96] uppercase"
				>
					<span class="label-dot size-1.5 rounded-full bg-green"></span>
					for developers who'd rather ship than organize
				</div>
				<div class="mb-4 flex items-baseline gap-2.5">
					<span class="hero-name-wq font-bold text-primary">:writequit</span>
				</div>
				<h1 class="hero-title mb-6 leading-[1.1] font-bold">
					<span class="block text-[#cdd6f4]">
						manage work, <br />
						not a workspace.
					</span>
					<span class="block text-primary">tasks. time. invoices. :wq.</span>
				</h1>
				<p
					class="mb-8 max-w-[38rem] text-[0.75rem] leading-[1.8] text-[#6e7a96]"
				>
					vim keybindings. markdown tasks. terminal aesthetics. a tool, not a
					lifestyle.
				</p>
				<div class="flex items-center gap-6 max-sm:flex-col max-sm:items-start">
					<a href="/login" class="btn-primary">
						<span class="opacity-60">&gt;</span>
						get started
					</a>
					<span class="text-[0.5rem] text-fg-muted">
						free during beta &middot; no credit card
					</span>
				</div>
			</section>

			<!-- Feature grid -->
			<section
				class="animate-fade-in mx-auto max-w-[64rem] px-8 py-12 max-sm:px-5"
				style="animation-delay: 0.5s;"
			>
				<div
					class="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-px border border-primary/8 bg-primary/8"
				>
					<div class="feature-card">
						<div class="mb-3 text-[0.8rem] font-semibold text-primary">
							[&gt;]
						</div>
						<h3 class="mb-2 text-[0.7rem] font-semibold text-[#cdd6f4]">
							Vim-native workflow
						</h3>
						<p class="feature-desc">
							<code>j/k</code>
							to navigate.
							<code>:</code>
							for commands.
							<code>:wq</code>
							when you're done. nothing new to learn.
						</p>
					</div>
					<div class="feature-card">
						<div class="mb-3 text-[0.8rem] font-semibold text-primary">[~]</div>
						<h3 class="mb-2 text-[0.7rem] font-semibold text-[#cdd6f4]">
							Time tracking
						</h3>
						<p class="feature-desc">
							<code>:track</code>
							to start.
							<code>:stop</code>
							to stop. hours logged, clients billed.
						</p>
					</div>
					<div class="feature-card">
						<div class="mb-3 text-[0.8rem] font-semibold text-primary">[$]</div>
						<h3 class="mb-2 text-[0.7rem] font-semibold text-[#cdd6f4]">
							Invoice generation
						</h3>
						<p class="feature-desc">
							select sessions, set rate, <code>:invoice</code>
							. PDF in your downloads. done.
						</p>
					</div>
					<div class="feature-card">
						<div class="mb-3 text-[0.8rem] font-semibold text-primary">[+]</div>
						<h3 class="mb-2 text-[0.7rem] font-semibold text-[#cdd6f4]">
							Tag everything
						</h3>
						<p class="feature-desc">
							inline tags in task text: <code>+frontend</code>
							<code>+urgent</code>
							<code>+client-name</code>
							. filter instantly. no dropdowns.
						</p>
					</div>
					<div class="feature-card">
						<div class="mb-3 text-[0.8rem] font-semibold text-primary">[*]</div>
						<h3 class="mb-2 text-[0.7rem] font-semibold text-[#cdd6f4]">
							Markdown tasks
						</h3>
						<p class="feature-desc">
							full markdown with syntax highlighting. no rich text editors. just
							text that renders.
						</p>
					</div>
					<div class="feature-card">
						<div class="mb-3 text-[0.8rem] font-semibold text-primary">[%]</div>
						<h3 class="mb-2 text-[0.7rem] font-semibold text-[#cdd6f4]">
							Reports that matter
						</h3>
						<p class="feature-desc">
							breakdowns by project, tag, or client. export to PDF. that's it.
						</p>
					</div>
				</div>
			</section>

			<!-- Terminal demo -->
			<section
				class="animate-fade-in mx-auto max-w-[48rem] px-8 py-12 max-sm:px-5"
				style="animation-delay: 0.7s;"
			>
				<div class="overflow-hidden border border-primary/15 bg-[#0d0d12]">
					<div
						class="flex items-center gap-1.5 border-b border-primary/8 bg-primary/4 px-3 py-2"
					>
						<span class="size-2 rounded-full bg-red"></span>
						<span class="size-2 rounded-full bg-warning"></span>
						<span class="size-2 rounded-full bg-green"></span>
						<span class="ml-2 text-[0.5rem] text-fg-muted">:wq - tasks</span>
					</div>
					<div class="p-4">
						<div
							class="flex items-center gap-3 border-l-2 border-transparent px-2 py-1.5 text-[0.6rem] transition-colors duration-150"
						>
							<span class="shrink-0 font-semibold text-green">[x]</span>
							<span class="flex-1 text-fg-dark">
								Set up CI/CD pipeline #devops
							</span>
							<span class="text-[0.5rem] text-fg-muted">2h 14m</span>
						</div>
						<div
							class="flex items-center gap-3 border-l-2 border-transparent px-2 py-1.5 text-[0.6rem] transition-colors duration-150"
						>
							<span class="shrink-0 font-semibold text-green">[x]</span>
							<span class="flex-1 text-fg-dark">
								Fix auth token refresh bug #backend
							</span>
							<span class="text-[0.5rem] text-fg-muted">0h 47m</span>
						</div>
						<div
							class="demo-line-active flex items-center gap-3 border-l-2 border-primary bg-primary/6 px-2 py-1.5 text-[0.6rem] transition-colors duration-150"
						>
							<span class="shrink-0 font-semibold text-primary">[*]</span>
							<span class="flex-1 text-fg-dark">
								Build landing page #frontend @acme
							</span>
							<span class="blink-slow text-[0.5rem] text-primary">1h 23m</span>
						</div>
						<div
							class="flex items-center gap-3 border-l-2 border-transparent px-2 py-1.5 text-[0.6rem] transition-colors duration-150"
						>
							<span class="shrink-0 font-semibold text-fg-muted">[ ]</span>
							<span class="flex-1 text-fg-dark">
								Write API documentation #docs
							</span>
							<span class="text-[0.5rem] text-fg-muted">--:--</span>
						</div>
						<div
							class="flex items-center gap-3 border-l-2 border-transparent px-2 py-1.5 text-[0.6rem] transition-colors duration-150"
						>
							<span class="shrink-0 font-semibold text-fg-muted">[ ]</span>
							<span class="flex-1 text-fg-dark">
								Invoice Acme Corp - December @acme
							</span>
							<span class="text-[0.5rem] text-fg-muted">--:--</span>
						</div>
						<div class="mt-3 border-t border-primary/8 pt-3 text-[0.6rem]">
							<span class="font-bold text-primary">:</span>
							<span class="text-[#cdd6f4]">
								wq
								<span
									class="cursor-inline text-primary"
									class:blink={showCursor}
								>
									█
								</span>
							</span>
						</div>
					</div>
				</div>
			</section>

			<!-- CTA -->
			<section
				class="animate-fade-in px-8 py-16 max-sm:px-5"
				style="animation-delay: 0.9s;"
			>
				<div class="mx-auto max-w-[48rem] text-center">
					<p class="mb-6 text-[0.8rem] text-[#6e7a96]">
						<span class="text-primary">&gt;</span>
						spend less time managing. more time building.
					</p>
					<a href="/login" class="btn-primary btn-primary-large">
						<span class="opacity-60">&gt;</span>
						start shipping
					</a>
				</div>
			</section>

			<!-- Footer -->
			<footer
				class="flex items-center justify-center gap-3 border-t border-primary/6 px-8 py-6 text-[0.5rem] text-surface-3"
			>
				<span class="font-semibold text-fg-muted">:wq</span>
				<span class="text-primary/15">&middot;</span>
				<span>write. quit. ship.</span>
				<span class="text-primary/15">&middot;</span>
				<span>a tool, not a lifestyle</span>
			</footer>
		</div>
	{/if}
</div>

<style>
	/* --- Keyframe animations (can't be expressed in Tailwind) --- */
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

	/* --- Animation utilities --- */
	.animate-fade-in {
		animation: fadeIn 0.6s ease both;
	}

	.blink-slow {
		animation: blinkSlow 2s ease infinite;
	}

	/* --- Dot grid background --- */
	.grid-bg {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 0;
		background-image: radial-gradient(
			circle,
			rgba(122, 162, 247, 0.3) 1px,
			transparent 1px
		);
		background-size: 32px 32px;
		mask-image: radial-gradient(
			ellipse 80% 60% at 50% 40%,
			black 0%,
			transparent 70%
		);
		-webkit-mask-image: radial-gradient(
			ellipse 80% 60% at 50% 40%,
			black 0%,
			transparent 70%
		);
	}

	/* --- Spotlight that brightens grid dots as it drifts --- */
	.grid-spotlight {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
		overflow: hidden;
	}

	.grid-spotlight::after {
		content: '';
		position: absolute;
		width: 60vw;
		height: 60vh;
		top: 10%;
		left: 20%;
		background: radial-gradient(
			ellipse at center,
			rgba(122, 162, 247, 0.07) 0%,
			transparent 70%
		);
		animation: spotlightDrift 14s ease-in-out infinite;
	}

	@keyframes spotlightDrift {
		0% {
			transform: translate(0%, 0%);
			opacity: 0.4;
		}
		25% {
			transform: translate(15%, 5%);
			opacity: 1;
		}
		50% {
			transform: translate(5%, 15%);
			opacity: 0.5;
		}
		75% {
			transform: translate(-10%, 8%);
			opacity: 1;
		}
		100% {
			transform: translate(0%, 0%);
			opacity: 0.4;
		}
	}

	/* --- Hero radial glow --- */
	.hero-glow {
		position: absolute;
		top: -40%;
		left: 50%;
		transform: translateX(-50%);
		width: 120%;
		height: 180%;
		pointer-events: none;
		z-index: -1;
		background: radial-gradient(
			ellipse 50% 40% at 50% 45%,
			rgba(122, 162, 247, 0.06) 0%,
			rgba(122, 162, 247, 0.02) 40%,
			transparent 70%
		);
	}

	/* --- Scanline overlay (complex gradient + pseudo-element) --- */
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
		top: 0;
		left: 0;
		width: 100%;
		height: 33vh;
		background: linear-gradient(
			transparent,
			rgba(100, 140, 255, 0.03) 12%,
			rgba(100, 140, 255, 0.03) 88%,
			transparent
		);
		animation: scanline 8s linear infinite;
	}

	/* --- Boot cursor toggle (conditional class:blink) --- */
	.cursor {
		opacity: 0;
		transition: opacity 0.05s;
	}

	.cursor.blink {
		opacity: 1;
	}

	.cursor-inline {
		opacity: 0;
		transition: opacity 0.05s;
	}

	.cursor-inline.blink {
		opacity: 1;
	}

	/* --- Label dot blink --- */
	.label-dot {
		animation: blinkSlow 2s ease infinite;
	}

	/* --- Hero name + title (clamp font sizes) --- */
	.hero-name-wq {
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		letter-spacing: -0.03em;
	}

	.hero-title {
		font-size: clamp(2rem, 6vw, 3.5rem);
		letter-spacing: -0.03em;
	}

	/* --- Primary button (hover transforms + box-shadow) --- */
	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1.5rem;
		background: var(--color-primary);
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

	.btn-primary-large {
		padding: 0.8rem 2rem;
		font-size: 0.75rem;
	}

	/* --- Feature card (hover bg transition) --- */
	.feature-card {
		padding: 1.5rem;
		background: #0a0a0e;
		transition: background 0.2s;
	}

	.feature-card:hover {
		background: #0d0d12;
	}

	/* --- Feature description + code styling --- */
	.feature-desc {
		font-size: 0.55rem;
		line-height: 1.8;
		color: #6e7a96;
		margin: 0;
	}

	.feature-desc code {
		color: var(--color-red);
		background: rgba(247, 118, 142, 0.08);
		padding: 0.05rem 0.2rem;
		font-size: 0.5rem;
	}
</style>

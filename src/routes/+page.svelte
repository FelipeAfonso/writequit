<script lang="ts">
	import { goto } from '$app/navigation';
	import { useAuthActions } from '$lib/auth';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	let { data } = $props();

	const isLocal = import.meta.env.DEV;
	const isDevConvex = PUBLIC_CONVEX_URL.includes(
		'REDACTED_DEV_DEPLOYMENT.convex.cloud'
	);
	const envBadge: 'dev-local' | 'local-prod' | 'dev-cloud' | null = isLocal
		? isDevConvex
			? 'dev-local'
			: 'local-prod'
		: isDevConvex
			? 'dev-cloud'
			: null;

	const { signIn } = useAuthActions();

	const softwareAppSchema = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'writequit',
		alternateName: ':wq',
		url: 'https://writequit.dev',
		applicationCategory: 'BusinessApplication',
		operatingSystem: 'Web',
		description:
			'A task manager, time tracker, and invoice generator built for freelance developers. Features vim keybindings, markdown tasks, and a terminal-style interface.',
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD',
			description: 'Free during beta'
		},
		featureList: [
			'Vim-native keyboard navigation',
			'Markdown task descriptions',
			'Built-in time tracking',
			'Invoice generation with PDF export',
			'Inline tag system',
			'Project and client reports'
		]
	});

	const faqSchema = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: [
			{
				'@type': 'Question',
				name: 'What is writequit?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'writequit is a task manager, time tracker, and invoice generator designed for freelance developers. It combines vim-style keybindings with a terminal aesthetic so you can manage tasks, log hours, and generate invoices without leaving a keyboard-driven workflow.'
				}
			},
			{
				'@type': 'Question',
				name: 'How does writequit handle time tracking?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'Type :track to start a timer and :stop to end it. Sessions are linked to tasks and projects automatically. When it is time to bill, select the sessions you need and generate a PDF invoice directly from your tracked hours.'
				}
			},
			{
				'@type': 'Question',
				name: 'Do I need to know vim to use writequit?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'No. writequit borrows familiar vim patterns like j/k navigation and colon commands, but everything also works with a mouse and standard UI interactions. The vim keybindings are a power-user shortcut, not a requirement.'
				}
			},
			{
				'@type': 'Question',
				name: 'Is writequit free?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'writequit is free during the beta period. No credit card is required to sign up. Pricing for future plans has not been announced yet.'
				}
			},
			{
				'@type': 'Question',
				name: 'How does invoicing work in writequit?',
				acceptedAnswer: {
					'@type': 'Answer',
					text: 'Select time sessions, set your hourly rate, and run :invoice. writequit generates a PDF invoice that downloads directly to your machine. No third-party integrations or payment processors required.'
				}
			}
		]
	});

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
		'█ ██║    ██║██╔═══██╗',
		'  ██║ █╗ ██║██║   ██║',
		'  ██║███╗██║██║▄▄ ██║',
		'█ ╚███╔███╔╝╚██████╔╝',
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

	function skipAnimation() {
		if (phase === 'done') return;
		// Fill all lines instantly
		typedLines = [...bootSequence];
		currentLine = bootSequence.length;
		currentChar = 0;
		bootComplete = true;
		phase = 'done';
		// Transition immediately to final state
		if (data.isLoggedIn) {
			goto('/app');
		} else {
			showContent = true;
		}
	}

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
			// Hold final state for 1.5s, then redirect or show landing
			const t = setTimeout(() => {
				if (data.isLoggedIn) {
					goto('/app');
				} else {
					showContent = true;
					phase = 'done';
				}
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

<svelte:window onkeydown={skipAnimation} onclick={skipAnimation} />

<svelte:head>
	<title>
		writequit — task manager, time tracker & invoicing for freelance developers
	</title>
	<meta
		name="description"
		content="writequit is a task manager, time tracker, and invoice generator built for freelance developers. Vim keybindings, markdown tasks, terminal UI. Manage work, not a workspace."
	/>
	<link rel="canonical" href="https://writequit.dev/" />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://writequit.dev/" />
	<meta
		property="og:title"
		content="writequit — tasks, time tracking & invoices for dev freelancers"
	/>
	<meta
		property="og:description"
		content="Vim keybindings. Markdown tasks. Terminal aesthetics. A task manager, time tracker, and invoice generator that gets out of your way."
	/>
	<meta property="og:site_name" content="writequit" />
	<meta property="og:image" content="https://writequit.dev/ogbanner.webp" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:type" content="image/webp" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta
		name="twitter:title"
		content="writequit — tasks, time tracking & invoices for dev freelancers"
	/>
	<meta
		name="twitter:description"
		content="Vim keybindings. Markdown tasks. Terminal aesthetics. A task manager, time tracker, and invoice generator that gets out of your way."
	/>
	<meta name="twitter:image" content="https://writequit.dev/ogbanner.webp" />

	<!-- Additional SEO -->
	<meta name="robots" content="index, follow" />
	<meta
		name="keywords"
		content="freelance task manager, time tracker for developers, developer invoice tool, vim task manager, terminal task manager, freelance time tracking, developer productivity"
	/>

	<!-- JSON-LD: SoftwareApplication -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html '<scr' +
		'ipt type="application/ld+json">' +
		softwareAppSchema +
		'</scr' +
		'ipt>'}

	<!-- JSON-LD: FAQPage -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html '<scr' +
		'ipt type="application/ld+json">' +
		faqSchema +
		'</scr' +
		'ipt>'}

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
		{#if !bootComplete}
			<span
				class="absolute right-4 bottom-4 z-101 font-[JetBrains_Mono,monospace] text-[0.65rem] text-[#6e7a96]"
			>
				press any key or click to skip
			</span>
		{/if}
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
					{#if envBadge}
						<span
							class="animate-env-pulse border px-1.5 py-0.5 font-mono text-[10px] leading-none
							{envBadge === 'dev-local'
								? 'border-orange/50 text-orange'
								: envBadge === 'local-prod'
									? 'border-red/50 text-red'
									: 'border-cyan/50 text-cyan'}"
						>
							{envBadge}
						</span>
					{/if}
				</div>
				<div class="flex items-center gap-2 text-[0.55rem]">
					{#if data.isLoggedIn}
						<a
							href="/app"
							class="border border-primary/30 px-2.5 py-1 text-primary transition-all duration-150 hover:border-primary hover:bg-primary/10"
						>
							:login
						</a>
					{:else}
						<button
							onclick={() => signIn()}
							class="border border-primary/30 px-2.5 py-1 text-primary transition-all duration-150 hover:border-primary hover:bg-primary/10"
						>
							:login
						</button>
					{/if}
				</div>
			</header>

			<!-- Hero -->
			<section
				class="animate-fade-in relative mx-auto max-w-208 px-8 pt-20 pb-16"
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
					<span class="block text-primary">tasks. time. invoices.</span>
				</h1>
				<p class="mb-8 max-w-152 text-[0.75rem] leading-[1.8] text-[#6e7a96]">
					vim keybindings. markdown tasks. terminal aesthetics. a tool, not a
					lifestyle.
				</p>
				<div class="flex items-center gap-6 max-sm:flex-col max-sm:items-start">
					{#if data.isLoggedIn}
						<a href="/app" class="btn-primary">
							<span class="opacity-60">&gt;</span>
							get started
						</a>
					{:else}
						<button onclick={() => signIn()} class="btn-primary">
							<span class="opacity-60">&gt;</span>
							get started
						</button>
						<span class="text-[0.5rem] text-fg-muted">
							free during beta &middot; no credit card
						</span>
					{/if}
				</div>
			</section>

			<!-- Feature grid -->
			<section
				class="animate-fade-in mx-auto max-w-5xl px-8 py-12 max-sm:px-5"
				style="animation-delay: 0.5s;"
			>
				<h2 class="sr-only">Features</h2>
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
				class="animate-fade-in mx-auto max-w-3xl px-8 py-12 max-sm:px-5"
				style="animation-delay: 0.7s;"
			>
				<div class="terminal-window">
					<div class="terminal-inner">
						<!-- Title bar -->
						<div
							class="flex items-center justify-between border-b border-border px-3 py-1.5"
						>
							<span class="font-mono text-[0.5rem] text-fg-muted">
								:wq - tasks
							</span>
						</div>

						<!-- Demo content matching real app -->
						<div
							class="flex flex-col gap-3 bg-bg p-4 font-mono"
							style="font-size: 0.6rem;"
						>
							<!-- Page header -->
							<div class="flex items-baseline gap-2">
								<span class="font-bold text-fg">
									<span class="text-fg-muted">#</span>
									tasks
								</span>
								<span class="text-fg-muted">5 tasks</span>
							</div>

							<!-- Editor area -->
							<div class="border border-border bg-bg-dark px-2 py-1.5">
								<span class="text-fg-muted">
									Build landing page +frontend @acme due:friday
									<span
										class="cursor-inline text-primary"
										class:blink={showCursor}
									>
										█
									</span>
								</span>
							</div>

							<!-- Filter row -->
							<div class="flex items-center gap-1">
								<span
									class="border border-primary bg-surface-2 px-1.5 py-0.5 text-primary"
								>
									[~] all
								</span>
								<span class="border border-border px-1.5 py-0.5 text-fg-muted">
									[&gt;] inbox
								</span>
								<span class="border border-border px-1.5 py-0.5 text-fg-muted">
									[*] active
								</span>
								<span class="border border-border px-1.5 py-0.5 text-fg-muted">
									[x] done
								</span>
							</div>

							<!-- Task cards -->
							<div class="flex flex-col gap-1">
								<!-- Done task -->
								<div
									class="flex items-start gap-2 border border-border bg-surface-0 px-2 py-1.5"
								>
									<span class="text-green">[x]</span>
									<span class="flex-1 text-fg-muted line-through">
										Set up CI/CD pipeline
									</span>
									<span
										class="border border-border-highlight bg-surface-2 px-1 text-teal"
									>
										+devops
									</span>
								</div>
								<!-- Done task -->
								<div
									class="flex items-start gap-2 border border-border bg-surface-0 px-2 py-1.5"
								>
									<span class="text-green">[x]</span>
									<span class="flex-1 text-fg-muted line-through">
										Fix auth token refresh bug
									</span>
									<span
										class="border border-border-highlight bg-surface-2 px-1 text-teal"
									>
										+backend
									</span>
								</div>
								<!-- Active/selected task -->
								<div
									class="flex items-start gap-2 border border-primary bg-surface-1 px-2 py-1.5"
								>
									<span class="text-blue">[*]</span>
									<span class="flex-1 text-fg">Build landing page</span>
									<span
										class="border border-border-highlight bg-surface-2 px-1 text-teal"
									>
										+frontend
									</span>
									<span class="text-warning">due:fri</span>
								</div>
								<!-- Inbox task -->
								<div
									class="flex items-start gap-2 border border-border bg-surface-0 px-2 py-1.5"
								>
									<span class="text-fg-muted">[&nbsp;]</span>
									<span class="flex-1 text-fg">Write API documentation</span>
									<span
										class="border border-border-highlight bg-surface-2 px-1 text-teal"
									>
										+docs
									</span>
								</div>
								<!-- Inbox task -->
								<div
									class="flex items-start gap-2 border border-border bg-surface-0 px-2 py-1.5"
								>
									<span class="text-fg-muted">[&nbsp;]</span>
									<span class="flex-1 text-fg">
										Invoice Acme Corp - December
									</span>
									<span
										class="border border-border-highlight bg-surface-2 px-1 text-orange"
									>
										@acme
									</span>
								</div>
							</div>

							<!-- Status bar -->
							<div
								class="flex items-center justify-between border-t border-border pt-2"
							>
								<span class="font-bold text-green">-- NORMAL --</span>
								<span class="text-fg-muted">3/5</span>
							</div>
						</div>
						<div class="crt-overlay"></div>
					</div>
				</div>
			</section>

			<!-- What is writequit — AEO definition block -->
			<section
				class="animate-fade-in mx-auto max-w-3xl px-8 py-12 max-sm:px-5"
				style="animation-delay: 0.85s;"
			>
				<h2
					class="mb-4 text-[0.75rem] font-semibold tracking-wide text-[#cdd6f4]"
				>
					What is writequit?
				</h2>
				<p class="mb-3 text-[0.6rem] leading-[1.9] text-[#6e7a96]">
					writequit is a task manager, time tracker, and invoice generator built
					for freelance developers. It combines vim-style keybindings with a
					terminal-inspired interface so you can manage projects, log hours, and
					bill clients without context-switching away from how you already work.
				</p>
				<p class="text-[0.6rem] leading-[1.9] text-[#6e7a96]">
					Tasks use markdown. Navigation uses <code class="faq-code">j/k</code>
					. Commands start with
					<code class="faq-code">:</code>
					— the same muscle memory you use in your editor. Time tracking, tagging,
					and invoicing are all built in, not bolted on.
				</p>
			</section>

			<!-- FAQ — AEO-optimized -->
			<section
				class="animate-fade-in mx-auto max-w-3xl px-8 py-12 max-sm:px-5"
				style="animation-delay: 0.9s;"
			>
				<h2
					class="mb-6 text-[0.75rem] font-semibold tracking-wide text-[#cdd6f4]"
				>
					Frequently asked questions
				</h2>
				<div class="flex flex-col gap-5">
					<div>
						<h3 class="mb-2 text-[0.65rem] font-semibold text-primary">
							How does time tracking work?
						</h3>
						<p class="text-[0.55rem] leading-[1.9] text-[#6e7a96]">
							Type <code class="faq-code">:track</code>
							to start a session and
							<code class="faq-code">:stop</code>
							to end it. Sessions link to tasks and projects automatically. When you
							need to bill, select the sessions and generate a PDF invoice from your
							tracked hours.
						</p>
					</div>
					<div>
						<h3 class="mb-2 text-[0.65rem] font-semibold text-primary">
							Do I need to know vim?
						</h3>
						<p class="text-[0.55rem] leading-[1.9] text-[#6e7a96]">
							No. writequit borrows familiar vim patterns like
							<code class="faq-code">j/k</code>
							navigation and colon commands, but everything works with a mouse too.
							The keybindings are a power-user shortcut, not a requirement.
						</p>
					</div>
					<div>
						<h3 class="mb-2 text-[0.65rem] font-semibold text-primary">
							Is writequit free?
						</h3>
						<p class="text-[0.55rem] leading-[1.9] text-[#6e7a96]">
							writequit is free during the beta. No credit card required. Future
							pricing has not been announced yet.
						</p>
					</div>
					<div>
						<h3 class="mb-2 text-[0.65rem] font-semibold text-primary">
							How does invoicing work?
						</h3>
						<p class="text-[0.55rem] leading-[1.9] text-[#6e7a96]">
							Select time sessions, set your rate, and run
							<code class="faq-code">:invoice</code>
							. A PDF downloads directly to your machine. No third-party payment processors
							or integrations needed.
						</p>
					</div>
					<div>
						<h3 class="mb-2 text-[0.65rem] font-semibold text-primary">
							What makes writequit different from other task managers?
						</h3>
						<p class="text-[0.55rem] leading-[1.9] text-[#6e7a96]">
							Most project tools are built for managers, not makers. writequit
							is built for developers who want to track tasks, log time, and
							send invoices from one keyboard-driven interface — no Kanban
							boards, no Gantt charts, no sprint ceremonies.
						</p>
					</div>
				</div>
			</section>

			<!-- CTA -->
			<section
				class="animate-fade-in px-8 py-16 max-sm:px-5"
				style="animation-delay: 0.95s;"
			>
				<div class="mx-auto max-w-3xl text-center">
					<p class="mb-6 text-[0.8rem] text-[#6e7a96]">
						<span class="text-primary">&gt;</span>
						spend less time managing. more time building.
					</p>
					{#if data.isLoggedIn}
						<a href="/app" class="btn-primary btn-primary-large">
							<span class="opacity-60">&gt;</span>
							start shipping
						</a>
					{:else}
						<button
							onclick={() => signIn()}
							class="btn-primary btn-primary-large"
						>
							<span class="opacity-60">&gt;</span>
							start shipping
						</button>
						<!-- else content here -->
					{/if}
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

	/* --- Hyprland-style terminal window --- */
	.terminal-window {
		padding: 2px;
		border-radius: 10px;
		background: rgba(122, 162, 247, 0.4);
	}

	.terminal-inner {
		position: relative;
		border-radius: 8px;
		background: #0d0d12;
		overflow: hidden;
	}

	/* CRT scanlines */
	.crt-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 10;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			rgba(0, 0, 0, 0.15) 2px,
			rgba(0, 0, 0, 0.15) 4px
		);
	}

	/* Phosphor glow — bleeds color outward slightly */
	.crt-overlay::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 60% at 50% 50%,
			rgba(122, 162, 247, 0.04) 0%,
			transparent 70%
		);
		filter: blur(6px);
	}

	/* Vignette — darkens edges like curved CRT glass */
	.crt-overlay::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 70% 65% at 50% 50%,
			transparent 50%,
			rgba(0, 0, 0, 0.45) 100%
		);
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

	/* --- FAQ inline code --- */
	.faq-code {
		color: var(--color-red);
		background: rgba(247, 118, 142, 0.08);
		padding: 0.05rem 0.25rem;
		font-size: inherit;
	}

	/* --- Screen-reader only (visually hidden h2) --- */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>

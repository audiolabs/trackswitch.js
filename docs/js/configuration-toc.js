(() => {
	const toc = document.querySelector(
		".docs-page--config .site-main > ul:first-of-type",
	);
	if (!(toc instanceof HTMLElement)) {
		return;
	}

	document.documentElement.style.scrollBehavior = "auto";

	const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
	const masthead = document.querySelector(".site-masthead");
	const items = links
		.map((link) => {
			const href = link.getAttribute("href");
			if (!href || href === "#") {
				return null;
			}

			const id = decodeURIComponent(href.slice(1));
			const section = document.getElementById(id);
			if (!section) {
				return null;
			}

			return { id, link, section };
		})
		.filter(Boolean);

	if (!items.length) {
		return;
	}

	const clearActiveState = () => {
		toc.querySelectorAll('a[aria-current="location"]').forEach((link) => {
			link.removeAttribute("aria-current");
		});

		toc
			.querySelectorAll("li.is-active, li.is-active-parent")
			.forEach((item) => {
				item.classList.remove("is-active", "is-active-parent");
			});
	};

	const setActive = (id) => {
		const current = items.find((item) => item.id === id);
		if (!current) {
			return;
		}

		clearActiveState();
		current.link.setAttribute("aria-current", "location");

		let li = current.link.closest("li");
		let isCurrent = true;
		while (li) {
			li.classList.add(isCurrent ? "is-active" : "is-active-parent");
			isCurrent = false;
			li = li.parentElement?.closest("li") ?? null;
		}
	};

	const syncFromHash = () => {
		const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
		if (hash) {
			activeId = hash;
			setActive(hash);
		}
	};

	let activeId = items[0].id;
	setActive(activeId);
	syncFromHash();

	const topOffset = 132;
	let ticking = false;

	const syncTocLayout = () => {
		if (window.innerWidth < 1120) {
			toc.style.top = "";
			toc.style.maxHeight = "";
			return;
		}

		const mastheadHeight =
			masthead instanceof HTMLElement ? masthead.offsetHeight : 0;
		const viewportHeight = window.innerHeight;
		const minTop = mastheadHeight + 24;
		const centeredTop =
			mastheadHeight +
			Math.max(24, (viewportHeight - mastheadHeight - toc.offsetHeight) / 2);
		const top = Math.max(minTop, Math.round(centeredTop));
		const maxHeight = Math.max(240, Math.floor(viewportHeight - top - 24));

		toc.style.top = `${top}px`;
		toc.style.maxHeight = `${maxHeight}px`;
	};

	const updateActiveFromScroll = () => {
		ticking = false;

		const scrollBottom = window.scrollY + window.innerHeight;
		const pageBottom = document.documentElement.scrollHeight;
		if (scrollBottom >= pageBottom - 4) {
			const lastId = items[items.length - 1]?.id;
			if (lastId && lastId !== activeId) {
				activeId = lastId;
				setActive(activeId);
			}
			return;
		}

		let nextId = items[0].id;
		for (const item of items) {
			const { top } = item.section.getBoundingClientRect();
			if (top - topOffset <= 0) {
				nextId = item.id;
				continue;
			}
			break;
		}

		if (nextId !== activeId) {
			activeId = nextId;
			setActive(activeId);
		}
	};

	const requestUpdate = () => {
		if (ticking) {
			return;
		}
		ticking = true;
		window.requestAnimationFrame(updateActiveFromScroll);
	};

	window.addEventListener("scroll", requestUpdate, { passive: true });
	window.addEventListener(
		"resize",
		() => {
			syncTocLayout();
			requestUpdate();
		},
		{ passive: true },
	);
	window.addEventListener(
		"hashchange",
		() => {
			syncFromHash();
			requestUpdate();
		},
		{ passive: true },
	);

	items.forEach((item) => {
		item.link.addEventListener("click", (event) => {
			event.preventDefault();
			activeId = item.id;
			setActive(activeId);
			const top =
				item.section.getBoundingClientRect().top +
				window.scrollY -
				topOffset +
				1;
			window.scrollTo({ top, behavior: "auto" });
			window.history.replaceState(null, "", `#${encodeURIComponent(item.id)}`);
		});
	});

	syncTocLayout();
	requestUpdate();
})();

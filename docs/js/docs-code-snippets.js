(() => {
	const main = document.querySelector(".site-main");
	if (!(main instanceof HTMLElement)) {
		return;
	}

	const copyTextToClipboard = (value) => {
		if (
			navigator.clipboard &&
			typeof navigator.clipboard.writeText === "function"
		) {
			return navigator.clipboard.writeText(value);
		}

		return new Promise((resolve, reject) => {
			const textarea = document.createElement("textarea");
			textarea.value = value;
			textarea.setAttribute("readonly", "");
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			textarea.style.pointerEvents = "none";
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();

			try {
				if (!document.execCommand("copy")) {
					throw new Error("Copy command was rejected.");
				}
				resolve();
			} catch (error) {
				reject(error);
			} finally {
				textarea.remove();
			}
		});
	};

	const isEligibleBlock = (node) => {
		if (!(node instanceof HTMLElement)) {
			return false;
		}

		if (node.matches("pre")) {
			return true;
		}

		return (
			node.matches("div.highlighter-rouge") &&
			node.querySelector("pre code") instanceof HTMLElement
		);
	};

	const createCopyButton = (wrapper, text) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "ts-doc-code-block__button";
		button.textContent = "Copy";
		button.setAttribute("aria-label", "Copy code snippet");
		button.setAttribute("title", "Copy code snippet");

		let resetTimer = null;
		const resetLabel = () => {
			button.textContent = "Copy";
			button.classList.remove("is-copied");
			resetTimer = null;
		};

		button.addEventListener("click", () => {
			copyTextToClipboard(text)
				.then(() => {
					button.textContent = "Copied";
					button.classList.add("is-copied");
					if (resetTimer !== null) {
						window.clearTimeout(resetTimer);
					}
					resetTimer = window.setTimeout(resetLabel, 1600);
				})
				.catch(() => {
					button.textContent = "Copy failed";
					button.classList.remove("is-copied");
					if (resetTimer !== null) {
						window.clearTimeout(resetTimer);
					}
					resetTimer = window.setTimeout(resetLabel, 1800);
				});
		});

		wrapper.appendChild(button);
	};

	const initializeCodeCopyButtons = () => {
		Array.from(main.querySelectorAll("pre, div.highlighter-rouge")).forEach(
			(block) => {
				if (!isEligibleBlock(block) || block.closest(".ts-doc-code-block")) {
					return;
				}

				const codeNode = block.matches("pre")
					? block.querySelector("code")
					: block.querySelector("pre code");

				const text =
					codeNode instanceof HTMLElement
						? codeNode.textContent
						: block.textContent;
				if (!text || !text.trim()) {
					return;
				}

				const wrapper = document.createElement("div");
				wrapper.className = "ts-doc-code-block";

				block.parentNode.insertBefore(wrapper, block);
				wrapper.appendChild(block);
				createCopyButton(wrapper, text.replace(/\n$/, ""));
			},
		);
	};

	const initializeMatrixControls = () => {
		const roots = Array.from(main.querySelectorAll("[data-doc-matrix]")).filter(
			(root) => root instanceof HTMLElement,
		);
		let sharedVersion =
			roots.find((root) => root.dataset.docMatrixVersion)?.dataset
				.docMatrixVersion || "default";

		const updateRoot = (root) => {
			root.dataset.docMatrixVersion = sharedVersion;

			const controls = Array.from(
				root.querySelectorAll("[data-doc-matrix-control]"),
			).filter((control) => control instanceof HTMLButtonElement);
			const panels = Array.from(
				root.querySelectorAll("[data-doc-matrix-panel]"),
			).filter((panel) => panel instanceof HTMLElement);

			const integration = root.dataset.docMatrixIntegration || "html";

			controls.forEach((control) => {
				const controlType = control.dataset.docMatrixControl;
				const value = control.dataset.docMatrixValue;
				const isActive =
					(controlType === "version" && value === sharedVersion) ||
					(controlType === "integration" && value === integration);
				control.classList.toggle("is-active", isActive);
				control.setAttribute("aria-pressed", isActive ? "true" : "false");
			});

			panels.forEach((panel) => {
				const panelIntegration = panel.dataset.docMatrixIntegration;
				const isActive =
					panel.dataset.docMatrixVersion === sharedVersion &&
					(!panelIntegration || panelIntegration === integration);
				panel.classList.toggle("is-active", isActive);
				panel.hidden = !isActive;
			});
		};

		const updateAll = () => {
			roots.forEach(updateRoot);
		};

		roots.forEach((root) => {
			const controls = Array.from(
				root.querySelectorAll("[data-doc-matrix-control]"),
			).filter((control) => control instanceof HTMLButtonElement);

			controls.forEach((control) => {
				control.addEventListener("click", () => {
					const previousTop = control.getBoundingClientRect().top;
					const controlType = control.dataset.docMatrixControl;
					const value = control.dataset.docMatrixValue;
					if (controlType === "version" && value) {
						sharedVersion = value;
					}
					if (controlType === "integration" && value) {
						root.dataset.docMatrixIntegration = value;
					}
					updateAll();

					const nextTop = control.getBoundingClientRect().top;
					const scrollDelta = nextTop - previousTop;
					if (Math.abs(scrollDelta) > 0.5) {
						window.scrollBy(0, scrollDelta);
					}
				});
			});
		});

		updateAll();
	};

	initializeCodeCopyButtons();
	initializeMatrixControls();
})();

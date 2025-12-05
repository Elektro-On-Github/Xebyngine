function initTimeline() {
    const { timelineRange: range, timelineThumb: thumb, timelineFill: fill, 
            timelineTooltip: tooltip, timelineTrack: track } = CreateConfig.elements;
    
    const ticksContainer = document.getElementById('timeline-ticks');
    const labelsContainer = document.getElementById('timeline-labels');
    const allowed = [1, 2, 4, 6, 8, 16, 24, 32, 48];

    if (!range || !thumb || !fill || !tooltip || !track || !ticksContainer || !labelsContainer) return;

    ticksContainer.innerHTML = labelsContainer.innerHTML = '';

    allowed.forEach((v, i) => {
        const pct = (i / (allowed.length - 1)) * 100;

        const tick = document.createElement('div');
        tick.className = 'timeline-tick';
        tick.style.left = pct + '%';
        tick.title = v + 'h';

        const label = document.createElement('div');
        label.className = 'timeline-label';
        label.textContent = (v === 1 || v === 48) ? (v + 'h') : v;
        label.dataset.value = v;
        label.style.left = pct + '%';

        ticksContainer.appendChild(tick);
        labelsContainer.appendChild(label);
    });

    const repositionLabels = () => {
        const rect = labelsContainer.getBoundingClientRect();
        const ticks = [...ticksContainer.children];
        const labels = [...labelsContainer.children];
        const minX = 4;
        const maxX = Math.max(4, rect.width - 4);

        labels.forEach((lbl, i) => {
            const tRect = ticks[i].getBoundingClientRect();
            const center = tRect.left - rect.left + tRect.width / 2;
            lbl.style.left = Math.min(Math.max(center, minX), maxX) + 'px';
        });
    };

    window.repositionTimelineLabels = repositionLabels;
    repositionLabels();

    const valueToPct = val => {
        const idx = allowed.indexOf(Number(val));
        return idx >= 0 ? (idx / (allowed.length - 1)) * 100 
                        : ((val - range.min) / (range.max - range.min)) * 100;
    };

    const pctToValue = pct => {
        const idx = Math.round(pct * (allowed.length - 1));
        return allowed[Math.min(Math.max(idx, 0), allowed.length - 1)];
    };

    const updateUI = (val, animate = true) => {
        const pct = valueToPct(val);
        fill.style.width = pct + '%';
        thumb.style.left = tooltip.style.left = `calc(${pct}% )`;
        tooltip.textContent = val + ' h';

        const ind = document.getElementById('timeline-selected-indicator');
        if (ind) ind.textContent = val + ' h';

        if (animate) {
            fill.classList.add('pulse');
            setTimeout(() => fill.classList.remove('pulse'), 900);
        }
    };

    const snapValue = v => allowed.reduce((nearest, x) => 
        Math.abs(v - x) < Math.abs(v - nearest) ? x : nearest, allowed[0]
    );

    let dragging = false;

    const onMove = clientX => {
        const rect = track.getBoundingClientRect();
        const pct = Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width;
        const val = pctToValue(pct);
        range.value = val;
        updateUI(val, false);
    };

    thumb.addEventListener('mousedown', () => {
        dragging = true;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            document.body.style.userSelect = 'auto';
            const v = snapValue(Number(range.value));
            range.value = v;
            updateUI(v, true);
        }
    });

    document.addEventListener('mousemove', e => {
        if (dragging) onMove(e.clientX);
    });

    thumb.addEventListener('touchstart', () => dragging = true, { passive: true });

    document.addEventListener('touchmove', e => {
        if (dragging) onMove(e.touches[0].clientX);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (dragging) {
            dragging = false;
            const v = snapValue(Number(range.value));
            range.value = v;
            updateUI(v, true);
        }
    }, { passive: true });

    track.addEventListener('click', e => {
        const rect = track.getBoundingClientRect();
        const val = pctToValue((e.clientX - rect.left) / rect.width);
        range.value = val;
        updateUI(val, true);
    });

    thumb.addEventListener('keydown', e => {
        let idx = allowed.indexOf(Number(range.value));
        if (idx < 0) idx = 0;

        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            idx = Math.min(allowed.length - 1, idx + 1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            idx = Math.max(0, idx - 1);
        }
        if (e.key === 'Enter') {
            range.value = snapValue(Number(range.value));
            updateUI(Number(range.value), true);
            return;
        }

        if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'].includes(e.key)) {
            range.value = allowed[idx];
            updateUI(allowed[idx], true);
            e.preventDefault();
        }
    });

    range.addEventListener('input', () => updateUI(Number(range.value), false));
    range.addEventListener('change', () => {
        const v = snapValue(Number(range.value));
        range.value = v;
        updateUI(v, true);
    });

    updateUI(Number(range.value), false);

    window.addEventListener('resize', repositionLabels);
}
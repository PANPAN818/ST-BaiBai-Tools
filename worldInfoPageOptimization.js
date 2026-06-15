import { AutoComplete } from '../../../autocomplete/AutoComplete.js';

let settings = {};
let extensionState = {};
let LOG_PREFIX = '[BaiBaiToolkit]';
let saveWorldInfoPageOptimizationSettings = null;

const WORLD_INFO_PAGE_APPEND_PATCH_KEY = '__baiBaiToolkitWorldInfoPageAppendPatched';
const WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY = '__baiBaiToolkitWorldInfoFloatingAutocompletePatched';
const WORLD_INFO_DEFERRED_MACROS_DATASET_KEY = 'baiBaiToolkitWorldInfoDeferredMacros';
const WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY = 'baiBaiToolkitWorldInfoDeferredMacrosValue';
const WORLD_INFO_CONTENT_TEXTAREA_SELECTOR = '.world_entry_edit textarea[name="content"][data-macros]';

export function configureWorldInfoPageOptimization(context = {}) {
    settings = context.settings ?? settings;
    extensionState = context.extensionState ?? extensionState;
    LOG_PREFIX = context.logPrefix ?? LOG_PREFIX;
    saveWorldInfoPageOptimizationSettings = context.saveSettings ?? saveWorldInfoPageOptimizationSettings;
}

export function bindWorldInfoPageOptimizationSettings({ saveSettings } = {}) {
    saveWorldInfoPageOptimizationSettings = saveSettings ?? saveWorldInfoPageOptimizationSettings;

    $('#bai_bai_toolkit_world_info_page_optimization_enabled')
        .prop('checked', Boolean(settings.worldInfoPageOptimizationEnabled))
        .on('input', function () {
            settings.worldInfoPageOptimizationEnabled = Boolean($(this).prop('checked'));

            if (typeof saveWorldInfoPageOptimizationSettings === 'function') {
                saveWorldInfoPageOptimizationSettings();
            }

            applyWorldInfoPageOptimization();
        });
}

export function applyWorldInfoPageOptimization() {
    const state = getWorldInfoPageOptimizationState();
    state.enabled = Boolean(settings.worldInfoPageOptimizationEnabled);

    if (!state.enabled) {
        removeWorldInfoPageOptimization(state);
        return;
    }

    patchWorldInfoFloatingAutocompletePosition(state);
    patchWorldInfoPageAppend(state);
    installDeferredMacroActivationListeners(state);

    console.debug(`${LOG_PREFIX} World info page optimization enabled`);
}

function removeWorldInfoPageOptimization(state = getWorldInfoPageOptimizationState()) {
    restoreDeferredWorldInfoMacroTextareas();
    removeDeferredMacroActivationListeners(state);
    restoreWorldInfoPageAppend(state);
    restoreWorldInfoFloatingAutocompletePosition(state);
}

function patchWorldInfoFloatingAutocompletePosition(state) {
    if (state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY]) {
        return;
    }

    const originalUpdateFloatingPosition = AutoComplete?.prototype?.updateFloatingPosition;

    if (typeof originalUpdateFloatingPosition !== 'function') {
        console.warn(`${LOG_PREFIX} AutoComplete floating positioning is unavailable; World Info autocomplete optimization was not installed`);
        return;
    }

    if (originalUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompletePatched) {
        state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY] = true;
        return;
    }

    function guardedUpdateFloatingPosition(...args) {
        if (!this.isActive) {
            return;
        }

        return originalUpdateFloatingPosition.apply(this, args);
    }

    guardedUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompletePatched = true;
    guardedUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompleteOriginal = originalUpdateFloatingPosition;
    AutoComplete.prototype.updateFloatingPosition = guardedUpdateFloatingPosition;
    state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY] = true;
}

function restoreWorldInfoFloatingAutocompletePosition(state) {
    const currentUpdateFloatingPosition = AutoComplete?.prototype?.updateFloatingPosition;

    if (currentUpdateFloatingPosition?.__baiBaiToolkitWorldInfoFloatingAutocompletePatched) {
        AutoComplete.prototype.updateFloatingPosition = currentUpdateFloatingPosition.__baiBaiToolkitWorldInfoFloatingAutocompleteOriginal;
    }

    state[WORLD_INFO_FLOATING_AUTOCOMPLETE_PATCH_KEY] = false;
}

function patchWorldInfoPageAppend(state) {
    if (state[WORLD_INFO_PAGE_APPEND_PATCH_KEY]) {
        return;
    }

    const originalAppend = globalThis.jQuery?.fn?.append;

    if (typeof originalAppend !== 'function') {
        console.warn(`${LOG_PREFIX} jQuery.append is unavailable; World Info macro autocomplete deferral was not installed`);
        return;
    }

    function patchedAppend(...args) {
        const result = originalAppend.apply(this, args);

        if (settings.worldInfoPageOptimizationEnabled) {
            this.each((_, target) => {
                deferWorldInfoMacroTextareas(target);
            });
        }

        return result;
    }

    patchedAppend.__baiBaiToolkitWorldInfoPageAppendPatched = true;
    patchedAppend.__baiBaiToolkitWorldInfoPageAppendOriginal = originalAppend;
    Object.assign(patchedAppend, originalAppend);
    globalThis.jQuery.fn.append = patchedAppend;
    state[WORLD_INFO_PAGE_APPEND_PATCH_KEY] = true;
}

function restoreWorldInfoPageAppend(state) {
    const currentAppend = globalThis.jQuery?.fn?.append;

    if (currentAppend?.__baiBaiToolkitWorldInfoPageAppendPatched) {
        globalThis.jQuery.fn.append = currentAppend.__baiBaiToolkitWorldInfoPageAppendOriginal;
    }

    state[WORLD_INFO_PAGE_APPEND_PATCH_KEY] = false;
}

function deferWorldInfoMacroTextareas(target) {
    if (!(target instanceof Element) || !target.matches('#world_popup_entries_list .inline-drawer-outlet')) {
        return;
    }

    target.querySelectorAll(WORLD_INFO_CONTENT_TEXTAREA_SELECTOR).forEach(textarea => {
        if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY] === 'true') {
            return;
        }

        textarea.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY] = 'true';
        textarea.dataset[WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY] = textarea.getAttribute('data-macros') ?? '';
        textarea.removeAttribute('data-macros');
    });
}

function installDeferredMacroActivationListeners(state) {
    if (state.deferredMacroActivationHandler) {
        return;
    }

    const handler = (event) => {
        activateDeferredWorldInfoMacroFromEvent(event);
    };

    document.addEventListener('focusin', handler, true);
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('click', handler, true);

    state.deferredMacroActivationHandler = handler;
}

function removeDeferredMacroActivationListeners(state) {
    const handler = state.deferredMacroActivationHandler;

    if (!handler) {
        return;
    }

    document.removeEventListener('focusin', handler, true);
    document.removeEventListener('pointerdown', handler, true);
    document.removeEventListener('click', handler, true);
    state.deferredMacroActivationHandler = null;
}

function activateDeferredWorldInfoMacroFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;

    if (!target) {
        return;
    }

    const textarea = findDeferredWorldInfoMacroTextarea(target);

    if (textarea) {
        restoreDeferredWorldInfoMacroTextarea(textarea);
    }
}

function findDeferredWorldInfoMacroTextarea(target) {
    const directTextarea = target.closest?.(`textarea[data-${toKebabCase(WORLD_INFO_DEFERRED_MACROS_DATASET_KEY)}="true"]`);

    if (directTextarea instanceof HTMLTextAreaElement) {
        return directTextarea;
    }

    const maximizeButton = target.closest?.('.editor_maximize[data-for]');
    const sourceId = maximizeButton?.getAttribute('data-for');
    const source = sourceId ? document.getElementById(sourceId) : null;

    return source instanceof HTMLTextAreaElement && source.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY] === 'true'
        ? source
        : null;
}

function restoreDeferredWorldInfoMacroTextareas() {
    document
        .querySelectorAll(`textarea[data-${toKebabCase(WORLD_INFO_DEFERRED_MACROS_DATASET_KEY)}="true"]`)
        .forEach(textarea => {
            if (textarea instanceof HTMLTextAreaElement) {
                restoreDeferredWorldInfoMacroTextarea(textarea);
            }
        });
}

function restoreDeferredWorldInfoMacroTextarea(textarea) {
    const value = textarea.dataset[WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY] ?? '';
    textarea.setAttribute('data-macros', value);
    delete textarea.dataset[WORLD_INFO_DEFERRED_MACROS_DATASET_KEY];
    delete textarea.dataset[WORLD_INFO_DEFERRED_MACROS_VALUE_DATASET_KEY];
}

function toKebabCase(value) {
    return String(value).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function getWorldInfoPageOptimizationState() {
    if (!extensionState.worldInfoPageOptimization || typeof extensionState.worldInfoPageOptimization !== 'object') {
        extensionState.worldInfoPageOptimization = {};
    }

    return extensionState.worldInfoPageOptimization;
}

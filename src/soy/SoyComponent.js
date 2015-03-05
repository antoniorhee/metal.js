'use strict';

import array from '../array/array';
import core from '../core';
import dom from '../dom/dom';
import object from '../object/object';
import Component from '../component/Component';
import ComponentCollector from '../component/ComponentCollector';
import ComponentRegistry from '../component/ComponentRegistry';
import DomVisitor from '../dom/DomVisitor';
import EventsCollector from '../component/EventsCollector';

import './SoyComponent.soy';

/**
 * We need to listen to calls to the SoyComponent template so we can use them to
 * properly instantiate and update child components defined through soy.
 * TODO: Switch to using proper AOP.
 */
var originalTemplate = ComponentRegistry.Templates.SoyComponent.component;

/**
 * Special Component class that handles a better integration between soy templates
 * and the components. It allows for automatic rendering of surfaces that have soy
 * templates defined with their names, skipping the call to `getSurfaceContent`.
 * @param {Object} opt_config An object with the initial values for this component's
 *   attributes.
 * @constructor
 * @extends {Component}
 */
class SoyComponent extends Component {
  constructor(opt_config) {
    super(opt_config);

    /**
     * Holds a `ComponentCollector` that will extract inner components.
     * @type {!ComponentCollector}
     * @protected
     * TODO(edu): Merge components and surfaces?
     */
    this.componentCollector_ = new ComponentCollector();

    /**
     * Holds events that were listened through the element.
     * @type {!EventHandler}
     * @protected
     */
    this.eventsCollector_ = new EventsCollector(this);

    /**
     * Stores the arguments that were passed to the last call to the
     * SoyComponent template for each component instance (mapped by its ref).
     * @type {!Object}
     * @protected
     */
    this.componentsInterceptedData_ = {};

    core.mergeSuperClassesProperty(this.constructor, 'TEMPLATES', this.mergeTemplates_);
  }

  /**
   * @inheritDoc
   * @override
   */
  attach(opt_parentElement, opt_siblingElement) {
    var visitor = DomVisitor.visit(this.element);
    this.informVisitorAttachListeners_(visitor);
    this.informVisitorExtractComponents_(visitor);
    visitor.start();

    super.attach(opt_parentElement, opt_siblingElement);
    return this;
  }

  /**
   * @inheritDoc
   * @override
   */
  detach() {
    this.componentsInterceptedData_ = {};
    this.eventsCollector_.detachAllListeners();
    super.detach();
    return this;
  }

  getComponents() {
    return this.componentCollector_.getComponents();
  }

  informVisitorAttachListeners_(visitor) {
    visitor.addHandler(this.eventsCollector_.attachListeners.bind(this.eventsCollector_));
  }

  informVisitorExtractComponents_(visitor) {
    visitor.addHandler(this.componentCollector_.extractComponents.bind(this.componentCollector_), this.componentsInterceptedData_);
  }

  /**
   * Overrides the default behavior so that this can automatically render
   * the appropriate soy template when one exists.
   * @param {string} surfaceId The surface id.
   * @return {Object|string} The content to be rendered.
   * @protected
   * @override
   */
  getSurfaceContent_(surfaceId) {
    var surfaceTemplate = this.constructor.TEMPLATES_MERGED[surfaceId];
    if (core.isFunction(surfaceTemplate)) {
      return this.renderTemplate_(surfaceTemplate);
    } else {
      return super.getSurfaceContent_(surfaceId);
    }
  }

  /**
   * Handles a call to the SoyComponent template.
   * @param {!Object} data The data the template was called with.
   * @return {string} The original return value of the template.
   */
  handleTemplateCall_(data) {
    this.componentsInterceptedData_[data.ref] = data;
    return originalTemplate.apply(originalTemplate, arguments);
  }

  /**
   * Merges an array of values for the `TEMPLATES` property into a single object.
   * @param {!Array} values The values to be merged.
   * @return {!Object} The merged value.
   * @protected
   */
  mergeTemplates_(values) {
    return object.mixin.apply(null, [{}].concat(values.reverse()));
  }

  /**
   * Renders this component's child components, if their placeholder is found.
   * @protected
   * TODO(edu): Re-think this part.
   */
  renderChildrenComponents_() {
    var placeholder = this.element.querySelector('#' + this.makeSurfaceId_('children-placeholder'));
    if (placeholder) {
      dom.removeChildren(placeholder);

      var children = this.children;
      children.forEach(function(child) {
        if (child.wasRendered) {
          dom.append(placeholder, child.element);
        } else {
          child.render(placeholder);
        }
      });
    }
  }

  /**
   * Overrides the behavior of this method to automatically render the element
   * template if it's defined and to automatically attach listeners to all
   * specified events by the user in the template. Also handles any calls to
   * component templates.
   * @override
   */
  renderInternal() {
    var elementTemplate = this.constructor.TEMPLATES_MERGED.element;
    if (core.isFunction(elementTemplate)) {
      dom.append(this.element, this.renderTemplate_(elementTemplate));
    }
  }

  /**
   * Overrides the default behavior of `renderSurfaceContent` to also
   * handle calls to component templates done by the surface's template.
   * @param {string} surfaceId The surface id.
   * @param {Object|string} content The content to be rendered.
   * @override
   */
  renderSurfaceContent(surfaceId, content) {
    super.renderSurfaceContent(surfaceId, content);

    if (this.inDocument) {
      var visitor = DomVisitor.visit(this.getSurfaceElement(surfaceId));
      this.informVisitorAttachListeners_(visitor);
      if (this.getSurface(surfaceId).cacheMiss) {
        this.informVisitorExtractComponents_(visitor);
      }
      this.eventsCollector_.detachListeners(this.makeSurfaceId_(surfaceId));
      visitor.start();
    }
  }

  /**
   * @inheritDoc
   */
  renderSurfacesContent_(surfaces) {
    super.renderSurfacesContent_(surfaces);

    if (this.inDocument) {
      this.setComponentsAttrs_();
      this.componentsInterceptedData_ = {};
    }
  }

  /**
   * Renders the specified template.
   * @param {!function()} templateFn [description]
   * @return {string} The template's result content.
   */
  renderTemplate_(templateFn) {
    ComponentRegistry.Templates.SoyComponent.component = this.handleTemplateCall_.bind(this);
    var content = templateFn(this, null, {}).content;
    ComponentRegistry.Templates.SoyComponent.component = originalTemplate;
    return content;
  }

  /**
   * Updates all inner components with their last template call data.
   * @protected
   */
  setComponentsAttrs_() {
    var rootComponents = this.componentCollector_.getRootComponents();
    for (var ref in rootComponents) {
      var data = this.componentsInterceptedData_[ref];
      if (data) {
        if (data.children) {
          this.componentCollector_.extractChildren(data.children.content, ref, this.componentsInterceptedData_);
        }
        if (rootComponents[data.ref]) {
          rootComponents[data.ref].setAttrs(data.data);
        }
      }
    }
  }

  /**
   * Syncs the component according to the new value of the `children` attribute.
   */
  syncChildren(newVal, prevVal) {
    if (!array.equal(newVal, prevVal || [])) {
      this.renderChildrenComponents_();
    }
  }
}

/**
 * The soy templates for this component. Templates that have the same
 * name of a registered surface will be used for automatically rendering
 * it.
 * @type {Object<string, !function(Object):Object>}
 * @protected
 * @static
 */
SoyComponent.TEMPLATES = {};

export default SoyComponent;
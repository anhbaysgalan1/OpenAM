/**
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS HEADER.
 *
 * Copyright (c) 2014-2015 ForgeRock AS. All rights reserved.
 *
 * The contents of this file are subject to the terms
 * of the Common Development and Distribution License
 * (the License). You may not use this file except in
 * compliance with the License.
 *
 * You can obtain a copy of the License at
 * http://forgerock.org/license/CDDLv1.0.html
 * See the License for the specific language governing
 * permission and limitations under the License.
 *
 * When distributing Covered Code, include this CDDL
 * Header Notice in each file and include the License file
 * at http://forgerock.org/license/CDDLv1.0.html
 * If applicable, add the following below the CDDL Header,
 * with the fields enclosed by brackets [] replaced by
 * your own identifying information:
 * "Portions Copyrighted [year] [name of copyright owner]"
 */

/**
 * @author Aleanora Kaladzinskaya
 * @author Eugenia Sergueeva
 */

/*global window, define, $, _, document, console */

define("org/forgerock/openam/ui/policy/policies/EditPolicyView", [
    "org/forgerock/openam/ui/policy/common/AbstractEditView",
    "org/forgerock/openam/ui/policy/common/ReviewInfoView",
    "org/forgerock/openam/ui/policy/delegates/PolicyDelegate",
    "org/forgerock/openam/ui/policy/common/ActionsView",
    "org/forgerock/openam/ui/policy/policies/ResourcesView",
    "org/forgerock/openam/ui/policy/policies/attributes/StaticResponseAttributesView",
    "org/forgerock/openam/ui/policy/policies/attributes/SubjectResponseAttributesView",
    "org/forgerock/commons/ui/common/util/UIUtils",
    "org/forgerock/commons/ui/common/util/Constants",
    "org/forgerock/openam/ui/common/components/Accordion",
    "org/forgerock/commons/ui/common/components/Messages",
    "org/forgerock/openam/ui/policy/policies/conditions/ManageSubjectsView",
    "org/forgerock/openam/ui/policy/policies/conditions/ManageEnvironmentsView",
    "org/forgerock/commons/ui/common/main/EventManager",
    "org/forgerock/commons/ui/common/main/Router"
], function (AbstractEditView, reviewInfoView, policyDelegate, actionsView, resourcesView, StaticResponseAttributesView,
             SubjectResponseAttributesView, uiUtils, constants, Accordion, messager, manageSubjects, manageEnvironments,
             eventManager, router) {
    var EditPolicyView = AbstractEditView.extend({
        template: "templates/policy/policies/EditPolicyTemplate.html",
        reviewTemplate: "templates/policy/policies/ReviewPolicyStepTemplate.html",
        validationFields: ["name", "resources"],

        render: function (args, callback) {
            var self = this,
                data = self.data,
                appName =                   args[0],
                policyName =                args[1],
                policyPromise =             this.getPolicy(policyName),
                appPromise =                policyDelegate.getApplicationByName(appName),
                allSubjectsPromise =        policyDelegate.getSubjectConditions(),
                allEnvironmentsPromise =    policyDelegate.getEnvironmentConditions(),
                allUserAttributesPromise =  policyDelegate.getAllUserAttributes(),
                resourceTypesPromise =      policyDelegate.listResourceTypes();

            this.events['change #availableResTypes'] = this.changeResourceType;

            $.when(policyPromise, appPromise, allSubjectsPromise, allEnvironmentsPromise, allUserAttributesPromise, resourceTypesPromise)
                .done(function (policy, app, allSubjects, allEnvironments, allUserAttributes, resourceTypes) {
                var actions = [],
                    staticAttributes = [],
                    userAttributes = [],
                    availableResourceTypes,
                    resourceType;

                if (policyName) {
                    policy.actions = policy.actionValues;
                    data.entity = policy;
                    data.entityName = policyName;
                } else {
                    data.entity = {};
                    data.entityName = null;
                }

                _.each(app[0].actions, function (value, key) {
                    actions.push({action: key, selected: false, value: value});
                });

                staticAttributes = _.where(policy.resourceAttributes, {type: "Static"});
                userAttributes = _.where(policy.resourceAttributes, {type: "User"});

                allUserAttributes = _.sortBy(allUserAttributes[0].result);

                data.entity.applicationName = appName;

                data.options = {};
                data.options.realm = app[0].realm;

                data.options.availableEnvironments = _.findByValues(allEnvironments[0].result, 'title', app[0].conditions);
                data.options.availableSubjects =     _.findByValues(allSubjects[0].result, 'title', app[0].subjects);

                // FIXME. temporary code until not added support of script condition type on sever side
                data.options.availableEnvironments.push({title: 'Script', logical: false, config: {type: "object", properties: {scripts: { items: { type: "string"}, type: "array"} } } });

                availableResourceTypes = _.filter(resourceTypes[0].result, function (item) {
                    return _.contains(app[0].resourceTypeUuids, item.uuid);
                });
                data.options.availableResourceTypes = availableResourceTypes;

                if (policy.resourceTypeUuid) {
                    resourceType = _.findWhere(data.options.availableResourceTypes, {uuid: policy.resourceTypeUuid});

                    data.options.availableActions = self.getAvailableActionsForResourceType(resourceType);
                    data.options.availablePatterns = resourceType.patterns;
                }

                self.parentRender(function () {

                    manageSubjects.render(data);
                    manageEnvironments.render(data);

                    actionsView.render(data);
                    resourcesView.render(data);

                    self.staticAttrsView = new StaticResponseAttributesView();
                    self.staticAttrsView.render(data.entity, staticAttributes, '#staticAttrs');

                    SubjectResponseAttributesView.render([userAttributes, allUserAttributes]);

                    self.prepareInfoReview();
                    self.validateThenRenderReview();
                    self.initAccordion();

                    if (callback) {
                        callback();
                    }
                });
            });
        },

        getAvailableActionsForResourceType: function (resourceType) {
            var availableActions = [];
            if (resourceType) {
                _.each(resourceType.actions, function (val, key) {
                    availableActions.push({action: key, selected: false, value: val});
                });
            }
            return availableActions;
        },

        changeResourceType: function (e) {
            this.data.entity.resourceTypeUuid = e.target.value;

            var resourceType = _.findWhere(this.data.options.availableResourceTypes, {uuid: e.target.value});

            this.data.options.availableActions = this.getAvailableActionsForResourceType(resourceType);
            this.data.options.availablePatterns = resourceType ? resourceType.patterns : [];

            this.data.options.newPattern = null;
            this.data.entity.resources = [];
            this.data.entity.actions = [];

            resourcesView.render(this.data);
            actionsView.render(this.data);
        },

        getPolicy: function (policyName) {
            var deferred = $.Deferred(),
                policy = {};

            if (policyName) {
                policyDelegate.getPolicyByName(policyName).done(function (policy) {
                    deferred.resolve(policy);
                });
            } else {
                deferred.resolve(policy);
            }
            return deferred.promise(policy);
        },

        updateFields: function () {
            var entity = this.data.entity,
                dataFields = this.$el.find('[data-field]');

            _.each(dataFields, function (field, key, list) {
                entity[field.getAttribute('data-field')] = field.value;
            });

            this.prepareInfoReview();
        },

        prepareInfoReview: function(){
            this.data.combinedStaticAttrs = this.staticAttrsView.getCombinedAttrs();
            this.data.userAttrs = SubjectResponseAttributesView.getAttrs();
            this.data.responseAttrs = this.data.combinedStaticAttrs.concat(this.data.userAttrs);
            this.data.subjectString = JSON.stringify(this.data.entity.subject, null, 2);
            this.data.environmentString = JSON.stringify(this.data.entity.condition, null, 2);
        },

        submitForm: function () {
            var policy = this.data.entity,
                persistedPolicy = _.clone(policy),
                self = this;

            persistedPolicy.actions = {};
            _.each(policy.actions, function (action) {
                if (action.selected) {
                    persistedPolicy.actions[action.action] = action.value;
                }
            });

            persistedPolicy.actionValues = persistedPolicy.actions;
            persistedPolicy.resourceAttributes = _.union(this.staticAttrsView.getCombinedAttrs(), SubjectResponseAttributesView.getAttrs());

            if (this.data.entityName) {
                policyDelegate.updatePolicy(this.data.entityName, persistedPolicy)
                .done( function (e) {
                    router.routeTo(router.configuration.routes.managePolicies, {args: [persistedPolicy.applicationName], trigger: true});
                    eventManager.sendEvent(constants.EVENT_DISPLAY_MESSAGE_REQUEST, "policyUpdated");
                })
                .fail( function(e) {
                    self.errorHandler(e);
                });

            } else {
                policyDelegate.createPolicy(persistedPolicy)
                .done( function (e) {
                    router.routeTo( router.configuration.routes.managePolicies, { args: [persistedPolicy.applicationName], trigger: true});
                    eventManager.sendEvent(constants.EVENT_DISPLAY_MESSAGE_REQUEST, "policyCreated");
                })
                .fail( function (e) {
                    self.errorHandler(e);
                });
            }
        },

        errorHandler: function (e) {

            var obj = { message: JSON.parse(e.responseText).message, type: "error"},
                invalidResourceText = "Invalid Resource";

            if (e.status === 500) {

                if (uiUtils.responseMessageMatch( e.responseText,"Unable to persist policy")){
                    eventManager.sendEvent(constants.EVENT_DISPLAY_MESSAGE_REQUEST, "unableToPersistPolicy");
                } else {
                    console.error(e.responseJSON, e.responseText, e);
                    messager.messages.addMessage(obj);
                }

            } else if (e.status === 400 || e.status === 404){

                if (uiUtils.responseMessageMatch(e.responseText, invalidResourceText)) {

                    this.data.options.invalidResource = obj.message.substr(invalidResourceText.length + 1);
                    reviewInfoView.render(this.data, null, this.$el.find('#reviewInfo'), this.reviewTemplate);
                    resourcesView.render(this.data);
                    delete this.data.options.invalidResource;

                    eventManager.sendEvent(constants.EVENT_DISPLAY_MESSAGE_REQUEST, "invalidResource");

                } else if (obj.message === "Policy " + this.data.entity.name + " already exists") {

                    this.data.options.invalidName = true;
                    reviewInfoView.render(this.data, null, this.$el.find('#reviewInfo'), this.reviewTemplate);
                    delete this.data.options.invalidName;
                    messager.messages.addMessage(obj);

                } else {
                    console.log(e.responseJSON, e.responseText, e);
                    messager.messages.addMessage(obj);
                }
            } else {
                console.log(e.responseJSON, e.responseText, e);
                messager.messages.addMessage(obj);
            }
        }

    });

    return new EditPolicyView();
});
/**
 * @license Copyright (c) 2003-2016, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

import CKEditorError from '../../../utils/ckeditorerror.js';

import OperationFactory from '../operation/operationfactory.js';

/**
 * A factory class for creating operations.
 *
 * Delta is a single, from the user action point of view, change in the editable document, like insert, split or
 * rename element. Delta is composed of operations, which are unit changes needed to be done to execute user action.
 *
 * Multiple deltas are grouped into a single {@link engine.treeModel.Batch}.
 *
 * @memberOf engine.treeModel.delta
 */
export default class DeltaFactory {
	/**
	 * Creates InsertDelta from deserialized object, i.e. from parsed JSON string.
	 *
	 * @param {Object} json
	 * @param {engine.treeModel.Document} doc Document on which this delta will be applied.
	 * @returns {engine.treeModel.delta.InsertDelta}
	 */
	static fromJSON( json, doc ) {
		if ( !deserializers.has( json.__className ) ) {
			/**
			 * This delta has no defined deserializer.
			 *
			 * @error delta-fromjson-no-deserializer
			 * @param {String} name
			 */
			throw new CKEditorError(
				'delta-fromjson-no-deserializer: This delta has no defined deserializer',
				{ name: json.__className }
			);
		}

		let Constructor = deserializers.get( json.__className );

		let delta = new Constructor();

		for ( let operation of json.operations ) {
			delta.addOperation( OperationFactory.fromJSON( operation, doc ) );
		}

		return delta;
	}
}

const deserializers = new Map();

export function registerDeserializer( className, constructor ) {
	deserializers.set( className, constructor );
}

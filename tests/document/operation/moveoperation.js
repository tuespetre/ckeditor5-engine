/**
 * @license Copyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* bender-tags: document */

'use strict';

const modules = bender.amd.require(
	'document/document',
	'document/operation/moveoperation',
	'document/position',
	'document/element',
	'document/nodelist',
	'ckeditorerror'
);

describe( 'MoveOperation', () => {
	let Document, MoveOperation, Position, Element, NodeList, CKEditorError;

	before( () => {
		Document = modules[ 'document/document' ];
		MoveOperation = modules[ 'document/operation/moveoperation' ];
		Position = modules[ 'document/position' ];
		Element = modules[ 'document/element' ];
		NodeList = modules[ 'document/nodelist' ];
		CKEditorError = modules.ckeditorerror;
	} );

	let doc, root;

	beforeEach( () => {
		doc = new Document();
		root = doc.createRoot( 'root' );
	} );

	it( 'should move from one node to another', () => {
		let p1 = new Element( 'p1', [], new Element( 'x' ) );
		let p2 = new Element( 'p2' );

		root.insertChildren( 0, [ p1, p2 ] );

		doc.applyOperation(
			new MoveOperation(
				new Position( [ 0, 0 ], root ),
				new Position( [ 1, 0 ], root ),
				1,
				doc.version
			)
		);

		expect( doc.version ).to.equal( 1 );
		expect( root.getChildCount() ).to.equal( 2 );
		expect( root.getChild( 0 ).name ).to.equal( 'p1' );
		expect( root.getChild( 1 ).name ).to.equal( 'p2' );
		expect( p1.getChildCount() ).to.equal( 0 );
		expect( p2.getChildCount() ).to.equal( 1 );
		expect( p2.getChild( 0 ).name ).to.equal( 'x' );
	} );

	it( 'should move position of children in one node backward', () => {
		root.insertChildren( 0, 'xbarx' );

		doc.applyOperation(
			new MoveOperation(
				new Position( [ 2 ], root ),
				new Position( [ 1 ], root ),
				2,
				doc.version
			)
		);

		expect( doc.version ).to.equal( 1 );
		expect( root.getChildCount() ).to.equal( 5 );
		expect( root.getChild( 0 ).character ).to.equal( 'x' );
		expect( root.getChild( 1 ).character ).to.equal( 'a' );
		expect( root.getChild( 2 ).character ).to.equal( 'r' );
		expect( root.getChild( 3 ).character ).to.equal( 'b' );
		expect( root.getChild( 4 ).character ).to.equal( 'x' );
	} );

	it( 'should move position of children in one node forward', () => {
		root.insertChildren( 0, 'xbarx' );

		doc.applyOperation(
			new MoveOperation(
				new Position( [ 1 ], root ),
				new Position( [ 4 ], root ),
				2,
				doc.version
			)
		);

		expect( doc.version ).to.equal( 1 );
		expect( root.getChildCount() ).to.equal( 5 );
		expect( root.getChild( 0 ).character ).to.equal( 'x' );
		expect( root.getChild( 1 ).character ).to.equal( 'r' );
		expect( root.getChild( 2 ).character ).to.equal( 'b' );
		expect( root.getChild( 3 ).character ).to.equal( 'a' );
		expect( root.getChild( 4 ).character ).to.equal( 'x' );
	} );

	it( 'should create a move operation as a reverse', () => {
		let nodeList = new NodeList( 'bar' );

		let sourcePosition = new Position( [ 0 ], root );
		let targetPosition = new Position( [ 4 ], root );

		let operation = new MoveOperation( sourcePosition, targetPosition, nodeList.length, doc.version );

		let reverse = operation.getReversed();

		expect( reverse ).to.be.an.instanceof( MoveOperation );
		expect( reverse.baseVersion ).to.equal( 1 );
		expect( reverse.howMany ).to.equal( nodeList.length );
		expect( reverse.sourcePosition ).to.equal( targetPosition );
		expect( reverse.targetPosition ).to.equal( sourcePosition );
	} );

	it( 'should undo move node by applying reverse operation', () => {
		let p1 = new Element( 'p1', [], new Element( 'x' ) );
		let p2 = new Element( 'p2' );

		root.insertChildren( 0, [ p1, p2 ] );

		let operation = new MoveOperation(
			new Position( [ 0, 0 ], root ),
			new Position( [ 1, 0 ], root ),
			1,
			doc.version
		);

		doc.applyOperation( operation );

		expect( doc.version ).to.equal( 1 );
		expect( root.getChildCount() ).to.equal( 2 );
		expect( p1.getChildCount() ).to.equal( 0 );
		expect( p2.getChildCount() ).to.equal( 1 );
		expect( p2.getChild( 0 ).name ).to.equal( 'x' );

		doc.applyOperation( operation.getReversed() );

		expect( doc.version ).to.equal( 2 );
		expect( root.getChildCount() ).to.equal( 2 );
		expect( p1.getChildCount() ).to.equal( 1 );
		expect( p1.getChild( 0 ).name ).to.equal( 'x' );
		expect( p2.getChildCount() ).to.equal( 0 );
	} );

	it( 'should throw an error if number of nodes to move exceeds the number of existing nodes in given element', () => {
		root.insertChildren( 0, 'xbarx' );

		expect(
			() => {
				doc.applyOperation(
					new MoveOperation(
						new Position( [ 3 ], root ),
						new Position( [ 1 ], root ),
						3,
						doc.version
					)
				);
			}
		).to.throw( CKEditorError, /operation-move-nodes-do-not-exist/ );
	} );

	it( 'should throw an error if target or source parent-element specified by position does not exist', () => {
		let p = new Element( 'p' );
		p.insertChildren( 0, 'foo' );
		root.insertChildren( 0, [ 'ab', p ] );

		let operation = new MoveOperation(
			new Position( [ 2, 0 ], root ),
			new Position( [ 1 ], root ),
			3,
			doc.version
		);

		root.removeChildren( 2, 1 );

		expect(
			() => {
				doc.applyOperation( operation );
			}
		).to.throw( CKEditorError, /operation-move-position-invalid/ );
	} );

	it( 'should throw an error if operation tries to move a range between the beginning and the end of that range', () => {
		root.insertChildren( 0, 'xbarx' );

		let operation = new MoveOperation(
			new Position( [ 1 ], root ),
			new Position( [ 2 ], root ),
			3,
			doc.version
		);

		expect(
			() => {
				doc.applyOperation( operation );
			}
		).to.throw( CKEditorError, /operation-move-range-into-itself/ );
	} );

	it( 'should throw an error if operation tries to move a range into a sub-tree of a node that is in that range', () => {
		let p = new Element( 'p', [], [ new Element( 'p' ) ] );
		root.insertChildren( 0, [ 'ab', p, 'xy' ] );

		let operation = new MoveOperation(
			new Position( [ 1 ], root ),
			new Position( [ 2, 0, 0 ], root ),
			3,
			doc.version
		);

		expect(
			() => {
				doc.applyOperation( operation );
			}
		).to.throw( CKEditorError, /operation-move-node-into-itself/ );
	} );

	it( 'should not throw an error if operation move a range into a sibling', () => {
		let p = new Element( 'p' );
		root.insertChildren( 0, [ 'ab', p, 'xy' ] );

		let operation = new MoveOperation(
			new Position( [ 1 ], root ),
			new Position( [ 2, 0 ], root ),
			1,
			doc.version
		);

		expect(
			() => {
				doc.applyOperation( operation );
			}
		).not.to.throw();

		expect( root.getChildCount() ).to.equal( 4 );
		expect( p.getChildCount() ).to.equal( 1 );
		expect( p.getChild( 0 ).character ).to.equal( 'b' );
	} );
} );